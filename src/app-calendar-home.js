import { TERMS_VERSION } from "./config.js";
import { startAnalytics, track } from "./analytics.js";
import { initSurvey, notifyItemAdded } from "./survey.js";

// 既存の保存データを引き継ぐため、キー名は変えない。
const STORAGE_KEY = "tanoshimi-calendar-demo-v1";
const CONSENT_KEY = "tanoshimi-calendar-consent";
const $ = (selector) => document.querySelector(selector);
const state = loadState();
let selectedMonth = currentTokyoMonth();
let selectedDate = tokyoDateKey();
let selectedDateHasFocus = false;
let dateActionsVisible = false;
let addSource = "nav";
let toastTimer = null;
let storageReadFailed = false;

function loadState() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    return { personalEvents: Array.isArray(parsed.personalEvents) ? parsed.personalEvents : [] };
  } catch {
    storageReadFailed = true;
    return { personalEvents: [] };
  }
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    track("tanoshimi_error", { error_type: "storage_write" });
    showToast("保存できませんでした。ブラウザーの保存設定をご確認ください。");
    return false;
  }
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = text;
  return node;
}

function tokyoDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const values = {};
  for (const part of parts) {
    if (part.type !== "literal") values[part.type] = part.value;
  }
  return values.year + "-" + values.month + "-" + values.day;
}

function currentTokyoMonth() {
  const parts = tokyoDateKey().split("-").map(Number);
  return new Date(Date.UTC(parts[0], parts[1] - 1, 1));
}

function dateFromKey(dateKey) {
  const parts = dateKey.split("-").map(Number);
  return new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
}

function keyFromUTCDate(date) {
  return date.toISOString().slice(0, 10);
}

function formatDate(dateKey, options = {}) {
  const date = new Date(dateKey + "T12:00:00+09:00");
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "long",
    day: "numeric",
    weekday: "short",
    ...(options.year ? { year: "numeric" } : {})
  }).format(date);
}

function dayDifference(dateKey) {
  const today = dateFromKey(tokyoDateKey()).getTime();
  const target = dateFromKey(dateKey).getTime();
  return Math.round((target - today) / 86400000);
}

function savedItems() {
  return [...state.personalEvents].sort((a, b) => a.date.localeCompare(b.date));
}

function upcomingItems() {
  const today = tokyoDateKey();
  return savedItems().filter((item) => item.date >= today);
}

function makeEventCard(item) {
  const card = el("article", "event-card personal-event-card");
  card.append(el("h3", "", item.title));
  const meta = el("p", "event-meta");
  meta.append(el("span", "", formatDate(item.date, { year: true })));
  card.append(meta);
  const actions = el("div", "event-card-actions");
  const remove = el("button", "button button-remove button-small", "削除");
  remove.type = "button";
  remove.addEventListener("click", () => removeItem(item));
  actions.append(remove);
  card.append(actions);
  return card;
}

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("is-visible");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove("is-visible"), 2600);
}

function safeRender(render) {
  try {
    render();
  } catch (error) {
    console.error(error);
    track("tanoshimi_error", { error_type: "render" });
  }
}

function showPage(page) {
  document.querySelectorAll(".page-view").forEach((view) => {
    view.hidden = view.id !== "page-" + page;
  });
  document.querySelectorAll(".nav-button").forEach((button) => {
    const active = button.dataset.page === page;
    button.classList.toggle("is-active", active);
    if (active) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });
  if (page === "calendar") {
    safeRender(renderCalendar);
    safeRender(renderCalendarNext);
  }
  if (page === "personal") {
    safeRender(renderPersonalEvents);
    track("tanoshimi_add_view", { add_source: addSource });
  }
}

function renderCalendarNext() {
  const upcoming = upcomingItems();
  const nextCard = $("#nextCard");
  nextCard.replaceChildren();
  if (upcoming.length === 0) {
    const empty = el("div", "empty-next");
    empty.append(el("p", "next-label", "いちばん近い楽しみ"), el("p", "", "これからの楽しみを登録すると、ここに表示されます。"));
    nextCard.append(empty);
    return;
  }
  const next = upcoming[0];
  const days = dayDifference(next.date);
  nextCard.append(el("p", "next-label", "いちばん近い楽しみ"), el("h2", "", next.title));
  nextCard.append(el("p", "next-date", formatDate(next.date, { year: true })));
  const countdown = el("div", "countdown");
  countdown.append(el("strong", "", String(Math.max(days, 0))), el("span", "", days === 0 ? "今日" : "日後"));
  nextCard.append(countdown);
}

function positionDateActions(grid, anchor) {
  if (!anchor) return;
  const bubble = $("#selectedDateActions");
  const gridRect = grid.getBoundingClientRect();
  const anchorRect = anchor.getBoundingClientRect();
  const bubbleRect = bubble.getBoundingClientRect();
  const gap = 8;
  const side = gridRect.right - anchorRect.right >= bubbleRect.width + gap ? "right" : "left";
  const preferredLeft = side === "right"
    ? anchorRect.right - gridRect.left + gap
    : anchorRect.left - gridRect.left - bubbleRect.width - gap;
  const maxLeft = Math.max(0, gridRect.width - bubbleRect.width);
  const left = Math.max(0, Math.min(preferredLeft, maxLeft));
  const preferredTop = anchorRect.top - gridRect.top + (anchorRect.height - bubbleRect.height) / 2;
  const maxTop = Math.max(0, gridRect.height - bubbleRect.height);
  const top = Math.max(0, Math.min(preferredTop, maxTop));

  bubble.style.left = left + "px";
  bubble.style.top = top + "px";
  bubble.dataset.side = side;
}

function renderCalendar() {
  const year = selectedMonth.getUTCFullYear();
  const month = selectedMonth.getUTCMonth();
  $("#monthTitle").textContent = year + "年" + (month + 1) + "月";
  const grid = $("#calendarGrid");
  grid.replaceChildren();
  const firstDay = new Date(Date.UTC(year, month, 1));
  const mondayOffset = (firstDay.getUTCDay() + 6) % 7;
  const saved = savedItems();

  for (let index = 0; index < 42; index += 1) {
    const date = new Date(Date.UTC(year, month, 1 - mondayOffset + index));
    const key = keyFromUTCDate(date);
    const dayItems = saved.filter((item) => item.date === key);
    const button = el("button", "calendar-day");
    button.type = "button";
    button.setAttribute("role", "gridcell");
    button.setAttribute("aria-label", formatDate(key, { year: true }) + (dayItems.length ? "、" + dayItems.map((item) => item.title).join("、") : ""));
    button.title = dayItems.map((item) => item.title).join(" / ");
    button.append(el("span", "calendar-date-number", String(date.getUTCDate())));
    if (date.getUTCMonth() !== month) button.classList.add("is-outside");
    if (key === tokyoDateKey()) button.classList.add("is-today");
    if (key === selectedDate) button.classList.add("is-selected");
    if (dayItems.length) {
      button.classList.add("has-events");
      const names = el("span", "calendar-day-items");
      dayItems.slice(0, 3).forEach((item) => {
        names.append(el("span", "calendar-day-item", item.title));
      });
      if (dayItems.length > 3) names.append(el("span", "calendar-day-more", "+" + (dayItems.length - 3) + "件"));
      button.append(names);
    }
    button.addEventListener("click", () => {
      if (date.getUTCMonth() !== month) {
        selectedMonth = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
      }
      if (key === selectedDate && selectedDateHasFocus) {
        dateActionsVisible = true;
      } else {
        selectedDate = key;
        selectedDateHasFocus = true;
        dateActionsVisible = false;
      }
      safeRender(renderCalendar);
    });
    grid.append(button);
  }

  const dateActions = $("#selectedDateActions");
  dateActions.hidden = !dateActionsVisible;
  if (dateActionsVisible) {
    positionDateActions(grid, grid.querySelector(".calendar-day.is-selected"));
  }

  $("#selectedDayTitle").textContent = formatDate(selectedDate, { year: true });
  const selectedItems = saved.filter((item) => item.date === selectedDate);
  $("#selectedDayCount").textContent = selectedItems.length + "件";
  const dayList = $("#selectedDayEvents");
  dayList.replaceChildren();
  if (selectedItems.length === 0) {
    dayList.append(el("p", "day-empty", "この日に登録された楽しみはありません。"));
  } else {
    selectedItems.forEach((item) => {
      const row = el("div", "day-event-row");
      row.append(el("span", "day-event-name", item.title));
      dayList.append(row);
    });
  }
}

function removeItem(item) {
  const before = state.personalEvents;
  state.personalEvents = state.personalEvents.filter((event) => event.id !== item.id);
  if (!saveState()) {
    state.personalEvents = before;
    return;
  }
  track("tanoshimi_item_remove");
  safeRender(renderCalendarNext);
  safeRender(renderCalendar);
  safeRender(renderPersonalEvents);
  showToast("削除しました。");
}

function renderPersonalEvents() {
  const list = $("#personalEvents");
  list.replaceChildren();
  const items = savedItems();
  if (items.length === 0) {
    list.append(el("p", "day-empty", "まだ楽しみはありません。"));
    return;
  }
  items.forEach((item) => list.append(makeEventCard(item)));
}

// ---- 利用規約 ----

function hasConsent() {
  try {
    return localStorage.getItem(CONSENT_KEY) === TERMS_VERSION;
  } catch {
    return false;
  }
}

function updateTermsReadState() {
  const body = $("#termsBody");
  const reachedEnd = body.scrollTop + body.clientHeight >= body.scrollHeight - 8;
  if (!reachedEnd) return;
  $("#termsRead").disabled = false;
  $("#termsHint").textContent = "確認したら、チェックを入れてください。";
}

function openTerms(mode) {
  const body = $("#termsBody");
  $("#termsAgreeArea").hidden = mode !== "agree";
  $("#termsViewArea").hidden = mode !== "view";
  $("#termsDialog").hidden = false;
  body.scrollTop = 0;
  if (mode === "agree") {
    $("#termsRead").checked = false;
    $("#termsRead").disabled = true;
    $("#termsAgree").disabled = true;
    window.requestAnimationFrame(updateTermsReadState);
  }
  body.focus();
}

function agreeTerms() {
  try {
    localStorage.setItem(CONSENT_KEY, TERMS_VERSION);
  } catch {
    showToast("同意を保存できませんでした。ブラウザーの保存設定をご確認ください。");
    return;
  }
  $("#termsDialog").hidden = true;
  startAnalytics();
  track("tanoshimi_terms_agree", { terms_version: TERMS_VERSION });
  startApp();
}

// ---- 起動 ----

function startApp() {
  startAnalytics();
  if (storageReadFailed) track("tanoshimi_error", { error_type: "storage_read" });
  track("tanoshimi_app_ready", { entry_state: state.personalEvents.length > 0 ? "existing" : "new" });
  initSurvey({ today: () => tokyoDateKey(), hasItems: () => state.personalEvents.length > 0 });
}

document.querySelectorAll("[data-page]").forEach((button) => {
  button.addEventListener("click", (event) => {
    event.preventDefault();
    addSource = "nav";
    showPage(button.dataset.page);
  });
});

$("#closeSelectedDateActions").addEventListener("click", () => {
  dateActionsVisible = false;
  safeRender(renderCalendar);
});

$("#addPersonalOnDate").addEventListener("click", () => {
  dateActionsVisible = false;
  $("#personalTitle").value = "";
  $("#personalDate").value = selectedDate;
  addSource = "calendar_date";
  showPage("personal");
  $("#personalTitle").focus();
});

$("#previousMonth").addEventListener("click", () => {
  selectedMonth = new Date(Date.UTC(selectedMonth.getUTCFullYear(), selectedMonth.getUTCMonth() - 1, 1));
  selectedDateHasFocus = false;
  dateActionsVisible = false;
  safeRender(renderCalendar);
});

$("#nextMonth").addEventListener("click", () => {
  selectedMonth = new Date(Date.UTC(selectedMonth.getUTCFullYear(), selectedMonth.getUTCMonth() + 1, 1));
  selectedDateHasFocus = false;
  dateActionsVisible = false;
  safeRender(renderCalendar);
});

$("#personalForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const title = $("#personalTitle").value.trim();
  const date = $("#personalDate").value;
  if (!title || !date) return;
  state.personalEvents.push({
    id: "personal-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8),
    title,
    date,
    allDay: true
  });
  if (!saveState()) {
    state.personalEvents.pop();
    return;
  }
  track("tanoshimi_item_add", { add_source: addSource });
  addSource = "nav";
  $("#personalForm").reset();
  selectedDate = date;
  const parts = date.split("-").map(Number);
  selectedMonth = new Date(Date.UTC(parts[0], parts[1] - 1, 1));
  selectedDateHasFocus = false;
  dateActionsVisible = false;
  showPage("calendar");
  showToast("楽しみを追加しました。");
  notifyItemAdded();
});

$("#termsBody").addEventListener("scroll", updateTermsReadState);
$("#termsRead").addEventListener("change", () => {
  $("#termsAgree").disabled = !$("#termsRead").checked;
});
$("#termsAgree").addEventListener("click", agreeTerms);
$("#termsCloseView").addEventListener("click", () => {
  $("#termsDialog").hidden = true;
});
$("#showTermsButton").addEventListener("click", () => openTerms("view"));
$("#termsDialog").addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !$("#termsViewArea").hidden) $("#termsDialog").hidden = true;
});

window.addEventListener("resize", () => {
  if (!dateActionsVisible) return;
  const grid = $("#calendarGrid");
  positionDateActions(grid, grid.querySelector(".calendar-day.is-selected"));
});

try {
  safeRender(renderCalendarNext);
  safeRender(renderCalendar);
  safeRender(renderPersonalEvents);
  if (hasConsent()) startApp();
  else openTerms("agree");
} catch (error) {
  console.error(error);
  track("tanoshimi_error", { error_type: "app_initialization" });
}
