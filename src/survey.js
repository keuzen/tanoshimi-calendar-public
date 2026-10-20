// 任意の匿名アンケートの案内と送信。
import { APP_VERSION, SURVEY_ENDPOINT, SURVEY_VERSION } from "./config.js";
import { track } from "./analytics.js";

const STATE_KEY = "tanoshimi-calendar-survey-v1";
const PROMPT_DELAY_MS = 2000;
const COMMENT_MAX = 500;
const POST_TIMEOUT_MS = 15000;
const SCALE = ["まったくそう思わない", "そう思わない", "どちらとも言えない", "そう思う", "とてもそう思う"];
const QUESTIONS = [
  { id: "q1", text: "登録した楽しみを眺めると、待ち遠しい気持ちになった", needsAdd: true },
  { id: "q2", text: "楽しみの追加から確認まで、迷わず進められた" },
  { id: "q3", text: "操作の負担は小さかった" },
  { id: "comment", text: "気づいたこと、困ったこと、ご意見があればご自由に（任意）" }
];

const $ = (selector) => document.querySelector(selector);
let ctx = null;
let promptTimer = null;
let promptNo = 0;
let survey = null;

function loadState() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STATE_KEY) || "{}");
    return {
      promptCount: Number(parsed.promptCount) || 0,
      lastPromptDate: parsed.lastPromptDate || null,
      choice: parsed.choice || null,
      firstAddDate: parsed.firstAddDate || null
    };
  } catch {
    return { promptCount: 0, lastPromptDate: null, choice: null, firstAddDate: null };
  }
}

function saveState(state) {
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify(state));
  } catch {
    track("tanoshimi_error", { error_type: "storage_write" });
  }
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = text;
  return node;
}

function randomId() {
  if (window.crypto && typeof window.crypto.randomUUID === "function") return window.crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 12);
}

// ---- 案内（下部シート） ----

function schedulePrompt(no) {
  window.clearTimeout(promptTimer);
  promptTimer = window.setTimeout(() => showPrompt(no), PROMPT_DELAY_MS);
}

function showPrompt(no) {
  if (survey) return;
  const state = loadState();
  state.promptCount = no;
  state.lastPromptDate = ctx.today();
  saveState(state);
  promptNo = no;
  // 追加完了のお知らせと重ならないよう、先に消す。
  const toast = $("#toast");
  if (toast) toast.classList.remove("is-visible");
  $("#surveyPromptLater").hidden = no !== 1;
  $("#surveyPrompt").hidden = false;
  track("tanoshimi_survey_prompt_view", { prompt_no: String(no) });
}

function hidePrompt() {
  $("#surveyPrompt").hidden = true;
}

function choosePrompt(choice) {
  const state = loadState();
  state.choice = choice;
  saveState(state);
  hidePrompt();
}

// 起動時：初めて追加した日を補い、条件を満たせば2回目の案内を出す。
export function initSurvey(context) {
  ctx = context;
  const state = loadState();
  const today = ctx.today();
  if (ctx.hasItems() && !state.firstAddDate) {
    state.firstAddDate = today;
    saveState(state);
  }
  if (state.promptCount === 1 && state.choice === "later" && state.lastPromptDate !== today && ctx.hasItems()) {
    schedulePrompt(2);
  }

  $("#surveyPromptAnswer").addEventListener("click", () => {
    hidePrompt();
    openSurvey(promptNo === 2 ? "prompt2" : "prompt1");
  });
  $("#surveyPromptLater").addEventListener("click", () => {
    choosePrompt("later");
    track("tanoshimi_survey_later");
  });
  $("#surveyPromptDecline").addEventListener("click", () => {
    choosePrompt("declined");
    track("tanoshimi_survey_decline");
  });
  $("#feedbackButton").addEventListener("click", () => {
    hidePrompt();
    openSurvey("button");
  });
  $("#surveyClose").addEventListener("click", closeSurvey);
  $("#surveyDialog").addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeSurvey();
  });
}

// 楽しみを追加し、カレンダーに戻った後に呼ぶ。
export function notifyItemAdded() {
  const state = loadState();
  if (!state.firstAddDate) {
    state.firstAddDate = ctx.today();
    saveState(state);
  }
  if (state.promptCount === 0 && !state.choice) schedulePrompt(1);
}

// ---- アンケート画面 ----

function openSurvey(source) {
  window.clearTimeout(promptTimer);
  const state = loadState();
  const reached = ctx.hasItems() || Boolean(state.firstAddDate);
  survey = {
    rid: randomId(),
    source,
    reached,
    onReturn: Boolean(state.firstAddDate) && state.firstAddDate !== ctx.today(),
    questions: QUESTIONS.filter((question) => reached || !question.needsAdd),
    answers: {},
    comment: "",
    step: -1,
    startedAt: Date.now(),
    partialSent: false,
    submitting: false
  };
  $("#surveyWebsite").value = "";
  $("#surveyDialog").hidden = false;
  renderSurvey();
  track("tanoshimi_survey_start", { survey_source: source === "button" ? "button" : "prompt" });
  $("#surveyClose").focus();
}

function closeSurvey() {
  survey = null;
  $("#surveyDialog").hidden = true;
  $("#feedbackButton").focus();
}

function renderSurvey() {
  const body = $("#surveyBody");
  body.replaceChildren();
  const actions = el("div", "survey-actions");

  if (survey.step === -1) {
    body.append(
      el("h2", "survey-title", "感想を送る"),
      el("p", "survey-note", "回答は匿名で、Googleのサービスに送信・保存されます。氏名・連絡先など、個人情報は書かないでください。回答は任意で、いつでも中止できます。"),
      el("p", "survey-note", "選択式で、1分ほどで終わります。")
    );
    const start = el("button", "button button-primary", "始める");
    start.type = "button";
    start.addEventListener("click", () => {
      survey.step = 0;
      renderSurvey();
    });
    actions.append(start);
    body.append(actions);
    return;
  }

  if (survey.step >= survey.questions.length) {
    body.append(el("h2", "survey-title", "ありがとうございます"), el("p", "survey-note", "今後の改善の参考にさせていただきます。"));
    const close = el("button", "button button-primary", "閉じる");
    close.type = "button";
    close.addEventListener("click", closeSurvey);
    actions.append(close);
    body.append(actions);
    return;
  }

  const question = survey.questions[survey.step];
  const isLast = survey.step === survey.questions.length - 1;
  body.append(el("p", "survey-progress", (survey.step + 1) + " / " + survey.questions.length));
  const heading = el("h2", "survey-question", question.text);
  heading.id = "surveyQuestionText";
  body.append(heading);

  const next = el("button", "button button-primary", isLast ? "送信する" : "次へ");
  next.type = "button";

  if (question.id === "comment") {
    const area = document.createElement("textarea");
    area.className = "survey-comment";
    area.maxLength = COMMENT_MAX;
    area.rows = 5;
    area.value = survey.comment;
    area.setAttribute("aria-labelledby", "surveyQuestionText");
    const count = el("p", "survey-count", area.value.length + " / " + COMMENT_MAX);
    area.addEventListener("input", () => {
      survey.comment = area.value;
      count.textContent = area.value.length + " / " + COMMENT_MAX;
    });
    body.append(area, count);
  } else {
    const group = el("div", "survey-scale");
    group.setAttribute("role", "radiogroup");
    group.setAttribute("aria-labelledby", "surveyQuestionText");
    SCALE.forEach((label, index) => {
      const value = index + 1;
      const option = el("button", "survey-option" + (survey.answers[question.id] === value ? " is-selected" : ""));
      option.type = "button";
      option.setAttribute("role", "radio");
      option.setAttribute("aria-checked", String(survey.answers[question.id] === value));
      option.append(el("strong", "", String(value)), el("span", "", label));
      option.addEventListener("click", () => {
        survey.answers[question.id] = value;
        renderSurvey();
      });
      group.append(option);
    });
    body.append(group);
    next.disabled = !survey.answers[question.id];
  }

  const error = el("p", "survey-error");
  error.id = "surveyError";
  error.hidden = true;
  body.append(error);

  if (survey.step > 0) {
    const back = el("button", "button button-outline", "戻る");
    back.type = "button";
    back.addEventListener("click", () => {
      survey.step -= 1;
      renderSurvey();
    });
    actions.append(back);
  }
  next.addEventListener("click", () => {
    if (isLast) {
      submitSurvey(next, error);
      return;
    }
    if (survey.step === 0 && !survey.partialSent) {
      survey.partialSent = true;
      survey.partialPromise = postSurvey(buildPayload(false)).catch(() => false);
    }
    survey.step += 1;
    renderSurvey();
  });
  actions.append(next);
  body.append(actions);
}

function buildPayload(complete) {
  const payload = {
    rid: survey.rid,
    survey_version: SURVEY_VERSION,
    app_version: APP_VERSION,
    reached_add: survey.reached ? "yes" : "no",
    on_return: survey.onReturn ? "yes" : "no",
    source: survey.source,
    complete: complete ? "true" : "false",
    elapsed_sec: String(Math.min(86400, Math.max(0, Math.round((Date.now() - survey.startedAt) / 1000))))
  };
  ["q1", "q2", "q3"].forEach((id) => {
    if (survey.answers[id]) payload[id] = String(survey.answers[id]);
  });
  const comment = survey.comment.trim().slice(0, COMMENT_MAX);
  if (comment) payload.comment = comment;
  return payload;
}

async function postSurvey(payload) {
  if (!SURVEY_ENDPOINT) {
    console.debug("[survey] 送信先が未設定のため、送信内容だけを出します。", payload);
    return true;
  }
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), POST_TIMEOUT_MS);
  try {
    const response = await fetch(SURVEY_ENDPOINT, {
      method: "POST",
      body: new URLSearchParams(payload),
      signal: controller.signal
    });
    const result = await response.json();
    return Boolean(result && result.ok === true);
  } finally {
    window.clearTimeout(timer);
  }
}

async function submitSurvey(button, error) {
  if (survey.submitting) return;
  const current = survey;
  // 罠の欄に値がある送信は、送ったことにして何もしない。
  if ($("#surveyWebsite").value) {
    current.step = current.questions.length;
    renderSurvey();
    return;
  }
  current.submitting = true;
  button.disabled = true;
  error.hidden = true;
  try {
    if (current.partialPromise) await current.partialPromise;
    const accepted = await postSurvey(buildPayload(true));
    if (!accepted) throw new Error("not accepted");
    const state = loadState();
    state.choice = "answered";
    saveState(state);
    track("tanoshimi_survey_submit", { survey_source: current.source === "button" ? "button" : "prompt" });
    if (survey !== current) return;
    current.step = current.questions.length;
    renderSurvey();
  } catch {
    if (survey !== current) return;
    current.submitting = false;
    button.disabled = false;
    error.textContent = "送信できませんでした。通信をご確認のうえ、もう一度お試しください。";
    error.hidden = false;
  }
}
