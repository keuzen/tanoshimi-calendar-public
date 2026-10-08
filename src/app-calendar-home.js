import { SAMPLE_EVENTS, SAMPLE_BUSY_BLOCKS, SAMPLE_AVAILABILITY_DATES } from "./sample-data.js";

const STORAGE_KEY = "tanoshimi-calendar-demo-v1";
const $ = (selector) => document.querySelector(selector);
const state = loadState();
let selectedMonth = currentTokyoMonth();
let selectedDate = tokyoDateKey();
let selectedFreeWindow = null;
let selectedDateHasFocus = false;
let dateActionsVisible = false;
let returnToCalendarAfterEventAdd = false;
let toastTimer = null;

function loadState() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    return {
      savedEventIds: Array.isArray(parsed.savedEventIds) ? parsed.savedEventIds : [],
      personalEvents: Array.isArray(parsed.personalEvents) ? parsed.personalEvents : []
    };
  } catch {
    return { savedEventIds: [], personalEvents: [] };
  }
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
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

function minutes(time) {
  const [hour, minute] = time.split(":").map(Number);
  return hour * 60 + minute;
}

function timeFromMinutes(value) {
  const hour = Math.floor(value / 60);
  const minute = value % 60;
  return String(hour).padStart(2, "0") + ":" + String(minute).padStart(2, "0");
}

function timeLabel(item) {
  if (item.allDay) return "";
  return item.startTime + "–" + item.endTime;
}

function sortItems(items) {
  return [...items].sort((a, b) => {
    const left = a.date + "T" + (a.startTime || "00:00");
    const right = b.date + "T" + (b.startTime || "00:00");
    return left.localeCompare(right);
  });
}

function savedItems() {
  const publicItems = SAMPLE_EVENTS
    .filter((event) => state.savedEventIds.includes(event.id))
    .map((event) => ({ ...event, itemType: "public" }));
  const personalItems = state.personalEvents.map((event) => ({
    ...event,
    genreLabel: "自分の楽しみ",
    itemType: "personal",
    allDay: true
  }));
  return sortItems(publicItems.concat(personalItems));
}

function upcomingItems() {
  const now = new Date();
  return savedItems().filter((item) => {
    const time = item.allDay ? "23:59" : item.startTime;
    return new Date(item.date + "T" + time + ":00+09:00") >= now;
  });
}

function makeEventCard(item, action, compact = false) {
  const card = el("article", "event-card" + (item.itemType === "personal" ? " personal-event-card" : ""));
  const top = el("div", "event-card-top");
  const badge = el("span", "genre-badge" + (item.genre === "mahjong" ? " is-mahjong" : ""), item.genreLabel);
  top.append(badge);
  if (!compact && action !== "add") top.append(el("span", "sample-label", item.itemType === "personal" ? "あなたの予定" : "架空サンプル"));
  card.append(top, el("h3", "", item.title));

  const meta = el("p", "event-meta");
  meta.append(el("span", "", formatDate(item.date, { year: true })));
  const time = timeLabel(item);
  if (time) meta.append(el("span", "", time));
  card.append(meta);

  if (item.description) {
    const details = document.createElement("details");
    details.append(el("summary", "", "内容を見る"), el("p", "event-description", item.description));
    card.append(details);
  }

  const actions = el("div", "event-card-actions");
  if (action === "add") {
    const alreadySaved = state.savedEventIds.includes(item.id);
    const button = el("button", "button button-primary button-small", alreadySaved ? "登録済み" : "カレンダーに追加");
    button.type = "button";
    button.disabled = alreadySaved;
    button.addEventListener("click", () => addEvent(item.id));
    actions.append(button);
  } else if (action === "remove") {
    const remove = el("button", "button button-remove button-small", "削除");
    remove.type = "button";
    remove.addEventListener("click", () => removeItem(item));
    if (!compact) actions.append(el("span", "sample-label", item.itemType === "personal" ? "自分の予定" : "カレンダー登録済み"));
    actions.append(remove);
  } else {
    actions.append(el("span", "sample-label", "楽しみを見つけたら登録"));
  }
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

function showPage(page) {
  document.querySelectorAll(".page-view").forEach((view) => {
    view.hidden = view.id !== "page-" + page;
  });
  document.querySelectorAll("[data-page]").forEach((button) => {
    const active = button.dataset.page === page;
    button.classList.toggle("is-active", active && button.classList.contains("nav-button"));
    if (button.classList.contains("nav-button")) {
      if (active) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    }
  });
  if (page === "calendar") {
    renderCalendar();
    renderCalendarNext();
  }
  if (page === "search") renderResults();
  if (page === "personal") renderPersonalEvents();
}

function renderCalendarNext() {
  const upcoming = upcomingItems();
  const nextCard = $("#nextCard");
  nextCard.replaceChildren();
  if (upcoming.length === 0) {
    const empty = el("div", "empty-next");
    empty.append(el("p", "next-label", "いちばん近い楽しみ"), el("p", "", "これからの楽しみを登録すると、ここに表示されます。"));
    nextCard.append(empty);
  } else {
    const next = upcoming[0];
    const days = dayDifference(next.date);
    nextCard.append(el("p", "next-label", "いちばん近い楽しみ"), el("h2", "", next.title));
    const time = timeLabel(next);
    nextCard.append(el("p", "next-date", formatDate(next.date, { year: true }) + (time ? " ・ " + time : "")));
    const countdown = el("div", "countdown");
    countdown.append(el("strong", "", String(Math.max(days, 0))), el("span", "", days === 0 ? "今日" : "日後"));
    nextCard.append(countdown);
  }

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
      renderCalendar();
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
      const time = timeLabel(item);
      if (time) row.append(el("span", "day-event-time", time));
      row.append(el("span", "day-event-name", item.title), el("span", "day-event-kind", item.genreLabel));
      dayList.append(row);
    });
  }
}

function freeWindows(date) {
  const dayStart = 9 * 60;
  const dayEnd = 23 * 60;
  const busy = SAMPLE_BUSY_BLOCKS
    .filter((block) => block.date === date)
    .map((block) => ({ start: minutes(block.start), end: minutes(block.end) }))
    .sort((a, b) => a.start - b.start);
  const windows = [];
  let cursor = dayStart;
  busy.forEach((block) => {
    if (block.start > cursor && block.start - cursor >= 60) windows.push({ start: cursor, end: block.start });
    cursor = Math.max(cursor, block.end);
  });
  if (dayEnd > cursor && dayEnd - cursor >= 60) windows.push({ start: cursor, end: dayEnd });
  return windows;
}

function renderAvailability() {
  const list = $("#availabilityList");
  list.replaceChildren();
  let slotCount = 0;
  SAMPLE_AVAILABILITY_DATES.forEach((date) => {
    const windows = freeWindows(date);
    if (!windows.length) return;
    const group = el("section", "availability-date");
    group.append(el("h3", "", formatDate(date, { year: true })));
    const buttons = el("div", "availability-windows");
    windows.forEach((window) => {
      slotCount += 1;
      const button = el("button", "slot-button", timeFromMinutes(window.start) + "–" + timeFromMinutes(window.end));
      button.type = "button";
      button.addEventListener("click", () => {
        selectedFreeWindow = { date, start: window.start, end: window.end };
        $("#searchDate").value = date;
        $("#availabilityPanel").hidden = true;
        $("#selectedSlotNote").hidden = false;
        $("#selectedSlotNote").textContent = formatDate(date, { year: true }) + " " + timeFromMinutes(window.start) + "–" + timeFromMinutes(window.end) + " の枠で検索中";
        renderResults();
      });
      buttons.append(button);
    });
    group.append(buttons);
    list.append(group);
  });
  if (!slotCount) list.append(el("p", "day-empty", "空き時間がありません。"));
}

function renderResults() {
  const date = $("#searchDate").value;
  const genre = $("#searchGenre").value;
  let results = SAMPLE_EVENTS.filter((event) => {
    if (date && event.date !== date) return false;
    if (genre !== "all" && event.genre !== genre) return false;
    if (selectedFreeWindow) {
      if (event.date !== selectedFreeWindow.date) return false;
      if (minutes(event.startTime) < selectedFreeWindow.start || minutes(event.endTime) > selectedFreeWindow.end) return false;
    }
    return true;
  });
  results = sortItems(results);
  $("#resultCount").textContent = results.length + "件";
  const container = $("#searchResults");
  container.replaceChildren();
  if (results.length === 0) {
    const empty = el("div", "empty-card");
    empty.append(el("strong", "", "条件に合うイベントがありません"));
    container.append(empty);
    return;
  }
  results.forEach((event) => container.append(makeEventCard(event, "add")));
}

function addEvent(id) {
  if (!state.savedEventIds.includes(id)) {
    state.savedEventIds.push(id);
    if (!saveState()) {
      state.savedEventIds = state.savedEventIds.filter((savedId) => savedId !== id);
      return;
    }
  }
  const addedEvent = SAMPLE_EVENTS.find((event) => event.id === id);
  if (returnToCalendarAfterEventAdd && addedEvent) {
    selectedDate = addedEvent.date;
    const [year, month] = addedEvent.date.split("-").map(Number);
    selectedMonth = new Date(Date.UTC(year, month - 1, 1));
    selectedDateHasFocus = false;
    dateActionsVisible = false;
    returnToCalendarAfterEventAdd = false;
    showPage("calendar");
    showToast("カレンダーに楽しみを追加しました。");
    return;
  }
  renderResults();
  renderCalendarNext();
  showToast("カレンダーに楽しみを追加しました。");
}

function removeItem(item) {
  if (item.itemType === "personal") {
    state.personalEvents = state.personalEvents.filter((event) => event.id !== item.id);
  } else {
    state.savedEventIds = state.savedEventIds.filter((id) => id !== item.id);
  }
  saveState();
  renderCalendarNext();
  renderCalendar();
  renderPersonalEvents();
  showToast("カレンダーから削除しました。");
}

function renderPersonalEvents() {
  const list = $("#personalEvents");
  if (!list) return;
  list.replaceChildren();
  savedItems().filter((item) => item.itemType === "personal").forEach((item) => list.append(makeEventCard(item, "remove", true)));
}

document.querySelectorAll("[data-page]").forEach((button) => {
  button.addEventListener("click", (event) => {
    event.preventDefault();
    returnToCalendarAfterEventAdd = false;
    showPage(button.dataset.page);
  });
});

$("#findEventsOnDate").addEventListener("click", () => {
  dateActionsVisible = false;
  returnToCalendarAfterEventAdd = true;
  selectedFreeWindow = null;
  $("#searchDate").value = selectedDate;
  $("#searchGenre").value = "all";
  $("#selectedSlotNote").hidden = true;
  $("#availabilityPanel").hidden = true;
  showPage("search");
});

$("#closeSelectedDateActions").addEventListener("click", () => {
  dateActionsVisible = false;
  renderCalendar();
});

$("#addPersonalOnDate").addEventListener("click", () => {
  dateActionsVisible = false;
  $("#personalTitle").value = "";
  $("#personalDate").value = selectedDate;
  showPage("personal");
  $("#personalTitle").focus();
});

$("#previousMonth").addEventListener("click", () => {
  selectedMonth = new Date(Date.UTC(selectedMonth.getUTCFullYear(), selectedMonth.getUTCMonth() - 1, 1));
  selectedDateHasFocus = false;
  dateActionsVisible = false;
  renderCalendar();
});

$("#nextMonth").addEventListener("click", () => {
  selectedMonth = new Date(Date.UTC(selectedMonth.getUTCFullYear(), selectedMonth.getUTCMonth() + 1, 1));
  selectedDateHasFocus = false;
  dateActionsVisible = false;
  renderCalendar();
});

$("#searchForm").addEventListener("submit", (event) => {
  event.preventDefault();
  selectedFreeWindow = null;
  $("#selectedSlotNote").hidden = true;
  $("#availabilityPanel").hidden = true;
  renderResults();
});

$("#searchDate").addEventListener("input", () => {
  selectedFreeWindow = null;
  $("#selectedSlotNote").hidden = true;
  renderResults();
});

$("#searchGenre").addEventListener("change", () => {
  selectedFreeWindow = null;
  $("#selectedSlotNote").hidden = true;
  renderResults();
});

$("#showAvailability").addEventListener("click", () => {
  renderAvailability();
  $("#availabilityPanel").hidden = false;
});

$("#closeAvailability").addEventListener("click", () => {
  $("#availabilityPanel").hidden = true;
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
  $("#personalForm").reset();
  renderPersonalEvents();
  renderCalendarNext();
  selectedDate = date;
  const parts = date.split("-").map(Number);
  selectedMonth = new Date(Date.UTC(parts[0], parts[1] - 1, 1));
  selectedDateHasFocus = false;
  dateActionsVisible = false;
  showPage("calendar");
  showToast("自分の楽しみを追加しました。");
});

$("#resetButton").addEventListener("click", () => {
  if (!window.confirm("このブラウザーに保存した楽しみをすべて削除しますか？")) return;
  state.savedEventIds = [];
  state.personalEvents = [];
  saveState();
  selectedFreeWindow = null;
  selectedDateHasFocus = false;
  dateActionsVisible = false;
  returnToCalendarAfterEventAdd = false;
  $("#searchDate").value = "";
  $("#searchGenre").value = "all";
  $("#selectedSlotNote").hidden = true;
  renderCalendarNext();
  renderCalendar();
  renderResults();
  renderPersonalEvents();
  showToast("デモの登録内容をリセットしました。");
});

window.addEventListener("resize", () => {
  if (!dateActionsVisible) return;
  const grid = $("#calendarGrid");
  positionDateActions(grid, grid.querySelector(".calendar-day.is-selected"));
});

renderCalendarNext();
renderCalendar();
renderResults();
renderPersonalEvents();
