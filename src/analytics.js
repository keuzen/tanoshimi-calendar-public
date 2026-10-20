// アクセス解析（GA）への送信。
// 許可リストにないイベント・パラメータ・値は送らない。
import { GA_MEASUREMENT_ID } from "./config.js";

const ADD_SOURCES = ["nav", "calendar_date"];
const SURVEY_SOURCES = ["prompt", "button"];

const EVENTS = {
  tanoshimi_app_ready: { entry_state: ["new", "existing"] },
  tanoshimi_terms_agree: { terms_version: null },
  tanoshimi_add_view: { add_source: ADD_SOURCES },
  tanoshimi_item_add: { add_source: ADD_SOURCES },
  tanoshimi_item_remove: {},
  tanoshimi_survey_prompt_view: { prompt_no: ["1", "2"] },
  tanoshimi_survey_later: {},
  tanoshimi_survey_decline: {},
  tanoshimi_survey_start: { survey_source: SURVEY_SOURCES },
  tanoshimi_survey_submit: { survey_source: SURVEY_SOURCES },
  tanoshimi_error: {
    error_type: ["storage_read", "storage_write", "app_initialization", "render", "unknown"]
  }
};

const TERMS_VERSION_PATTERN = /^v\d+$/;
let enabled = false;

function sanitize(name, params) {
  const rules = EVENTS[name];
  if (!rules) return null;
  const clean = {};
  for (const [key, allowed] of Object.entries(rules)) {
    if (params[key] === undefined) continue;
    const value = String(params[key]);
    if (allowed === null ? !TERMS_VERSION_PATTERN.test(value) : !allowed.includes(value)) return null;
    clean[key] = value;
  }
  return clean;
}

export function track(name, params = {}) {
  const clean = sanitize(name, params);
  if (!clean) return;
  // 同意前の行動は送らず、後から補わない。
  if (!enabled) return;
  if (!GA_MEASUREMENT_ID) {
    console.debug("[analytics]", name, clean);
    return;
  }
  window.gtag("event", name, clean);
}

// 利用規約の同意を保存した後にだけ呼ぶ。
export function startAnalytics() {
  if (enabled) return;
  enabled = true;
  if (GA_MEASUREMENT_ID) {
    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function gtag() { window.dataLayer.push(arguments); };
    window.gtag("js", new Date());
    window.gtag("config", GA_MEASUREMENT_ID, { send_page_view: true });
    const script = document.createElement("script");
    script.async = true;
    script.src = "https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(GA_MEASUREMENT_ID);
    script.onerror = () => console.warn("Google Analytics could not be loaded.");
    document.head.append(script);
  } else {
    console.info("[analytics] 測定IDが未設定のため、GAは読み込まずに送信内容だけをコンソールに出します。");
  }
}
