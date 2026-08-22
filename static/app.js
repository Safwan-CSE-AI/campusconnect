/**
 * CampusConnect AI - Frontend Single-Page Application
 * Handles state, REST APIs, WebSockets, Charts, Multi-step Wizards,
 * Ownership Verification, Safe Handovers, and Hackathon Demo Mode.
 * Fully WCAG 2.1 AA accessible with keyboard navigation.
 */

// Application State
let currentUser = {
  id: 1,
  name: "Alex Rivera",
  email: "student@campus.edu",
  student_or_employee_id: "STU-2024-8891",
  department: "Computer Science",
  role: "STUDENT",
  profile_image: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150"
};

let activeView = "home";
let feedItems = [];
let smartMatches = [];
let currentWizardType = "LOST";
let currentWizardStep = 1;
let categoryChartInstance = null;
let hourlyChartInstance = null;
let webSocket = null;
let currentClaimTarget = null;
let currentHandoverTarget = null;
let activeDetailItem = null;

// Initialize on DOM Ready
document.addEventListener("DOMContentLoaded", () => {
  initIcons();
  initWebSocket();
  loadFeedItems();
  loadMatches();
  loadNotifications();
  loadAnalytics();
  loadActivityFeed();

  // Global Keyboard Navigation: Close modals on Escape key
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeAllModals();
    }
  });

  // Setup Drag & Drop File Upload Listeners
  setupFileDropZone();
});


function initIcons() {
  if (window.lucide) {
    window.lucide.createIcons();
  }
}

function closeAllModals() {
  closeReportModal();
  closeClaimModal();
  closeHandoverModal();
  closeQrModal();
  closeDemoModal();
  closeItemDetailModal();
  if (typeof closeMatchMomentModal === "function") closeMatchMomentModal();
  document.getElementById("roleDropdownMenu")?.classList.add("hidden");
  document.getElementById("notificationsTray")?.classList.add("hidden");
}

// ----------------- WEBSOCKET REAL-TIME BROADCASTER -----------------

function initWebSocket() {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const wsUrl = `${protocol}//${window.location.host}/ws`;

  try {
    webSocket = new WebSocket(wsUrl);

    webSocket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        handleLiveEvent(data);
      } catch (err) {
        console.error("WS Parse error", err);
      }
    };

    webSocket.onclose = () => {
      setTimeout(initWebSocket, 3000);
    };
  } catch (e) {
    console.warn("WebSocket fallback mode", e);
  }
}

function handleLiveEvent(data) {
  if (data.type === "NEW_ITEM_REPORT") {
    showToast(`🔔 ${data.message}`, "info");
    loadFeedItems();
    loadMatches();
    loadNotifications();
  } else if (data.type === "NEW_CLAIM") {
    showToast(`🔐 ${data.message}`, "warning");
    loadNotifications();
    if (activeView === "admin") loadAdminDashboard();
  } else if (data.type === "HANDOVER_STATUS_CHANGE") {
    showToast(`🏛️ ${data.message}`, "success");
    if (data.is_completed) {
      triggerConfetti();
    }
    loadFeedItems();
    loadMatches();
    if (activeView === "admin") loadAdminDashboard();
    if (activeView === "dashboard") loadUserDashboard();
  } else if (data.type === "DEMO_COMPLETED") {
    triggerConfetti();
  }
}

// ----------------- NAVIGATION -----------------

function navigateTo(view) {
  activeView = view;
  const views = ["home", "feed", "matches", "hotspots", "intelligence", "dashboard", "admin"];
  views.forEach((v) => {
    const el = document.getElementById(`view-${v}`);
    if (el) el.classList.add("hidden");
    const navBtn = document.getElementById(`nav-${v}`);
    if (navBtn) {
      navBtn.classList.remove("text-blue-400", "bg-slate-800", "font-bold");
      navBtn.classList.add("text-slate-300");
    }
  });

  const targetEl = document.getElementById(`view-${view}`);
  if (targetEl) targetEl.classList.remove("hidden");

  const targetBtn = document.getElementById(`nav-${view}`);
  if (targetBtn) {
    targetBtn.classList.add("text-blue-400", "bg-slate-800", "font-bold");
    targetBtn.classList.remove("text-slate-300");
  }

  // View specific loaders
  if (view === "feed") loadFeedItems();
  if (view === "matches") loadMatches();
  if (view === "hotspots") loadAnalytics();
  if (view === "intelligence") { loadAnalytics(); loadActivityFeed(); }
  if (view === "dashboard") loadUserDashboard();
  if (view === "admin") loadAdminDashboard();

  window.scrollTo({ top: 0, behavior: "smooth" });
  initIcons();
}

function toggleMobileNav() {
  const nav = document.getElementById("mobileNav");
  nav.classList.toggle("hidden");
}

// ----------------- ROLE SWITCHER -----------------

function toggleRoleDropdown() {
  const menu = document.getElementById("roleDropdownMenu");
  menu.classList.toggle("hidden");
}

document.addEventListener("click", (e) => {
  const btn = document.getElementById("roleDropdownBtn");
  const menu = document.getElementById("roleDropdownMenu");
  if (btn && menu && !btn.contains(e.target) && !menu.contains(e.target)) {
    menu.classList.add("hidden");
  }
});

async function switchUserRole(role) {
  try {
    const res = await fetch(`/api/auth/switch-demo?role=${role}`, { method: "POST" });
    const data = await res.json();
    currentUser = data.user;

    document.getElementById("currentUserName").textContent = currentUser.name;
    document.getElementById("currentUserRoleTag").textContent = currentUser.role;
    document.getElementById("currentUserAvatar").src = currentUser.profile_image || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150";

    const adminOp = document.getElementById("adminOperatorName");
    if (adminOp) adminOp.textContent = currentUser.name;

    showToast(`Switched persona to ${currentUser.name} (${currentUser.role})`, "success");
    document.getElementById("roleDropdownMenu").classList.add("hidden");

    if (activeView === "dashboard") loadUserDashboard();
    if (activeView === "admin") loadAdminDashboard();
    loadNotifications();
  } catch (err) {
    console.error("Role switch error", err);
  }
}

// ----------------- NOTIFICATIONS -----------------

function toggleNotifications() {
  const tray = document.getElementById("notificationsTray");
  tray.classList.toggle("hidden");
}

async function loadNotifications() {
  try {
    const res = await fetch(`/api/notifications?user_id=${currentUser.id}`);
    const notifs = await res.json();

    const unreadCount = notifs.filter((n) => !n.is_read).length;
    const badge = document.getElementById("unreadNotifBadge");
    if (badge) {
      badge.textContent = unreadCount;
      badge.style.display = unreadCount > 0 ? "flex" : "none";
    }

    const list = document.getElementById("notificationsList");
    if (!list) return;

    if (notifs.length === 0) {
      list.innerHTML = `<p class="text-xs text-slate-500 text-center py-4">No notifications yet.</p>`;
      return;
    }

    list.innerHTML = notifs.map((n) => `
      <div class="p-2.5 rounded-xl ${n.is_read ? 'bg-slate-900/60' : 'bg-blue-500/10 border border-blue-500/20'} space-y-1 transition">
        <div class="flex items-center justify-between">
          <span class="text-xs font-bold text-slate-200">${escapeHtml(n.title)}</span>
          <span class="text-[10px] text-slate-500">${timeAgo(n.created_at)}</span>
        </div>
        <p class="text-[11px] text-slate-400">${escapeHtml(n.message)}</p>
      </div>
    `).join("");

    initIcons();
  } catch (err) {
    console.error("Error loading notifs", err);
  }
}

async function markAllNotificationsRead() {
  try {
    await fetch(`/api/notifications/read-all?user_id=${currentUser.id}`, { method: "PUT" });
    loadNotifications();
    showToast("Notifications marked as read", "info");
  } catch (err) {
    console.error(err);
  }
}

// ----------------- EXPLORE FEED -----------------

let searchDebounceTimeout = null;
function debounceFeedSearch() {
  clearTimeout(searchDebounceTimeout);
  searchDebounceTimeout = setTimeout(loadFeedItems, 300);
}

async function loadFeedItems() {
  const typeFilter = document.getElementById("feedTypeFilter")?.value || "";
  const catFilter = document.getElementById("feedCategoryFilter")?.value || "";
  const zoneFilter = document.getElementById("feedZoneFilter")?.value || "";
  const search = document.getElementById("feedSearchInput")?.value || "";

  const params = new URLSearchParams();
  if (typeFilter) params.append("report_type", typeFilter);
  if (catFilter && catFilter !== "All") params.append("category", catFilter);
  if (zoneFilter && zoneFilter !== "All") params.append("campus_zone", zoneFilter);
  if (search) params.append("query", search);
  params.append("user_id", currentUser.id);

  try {
    const res = await fetch(`/api/items?${params.toString()}`);
    feedItems = await res.json();
    renderFeedGrid(feedItems);
  } catch (err) {
    console.error("Feed load error", err);
  }
}

function renderFeedGrid(items) {
  const grid = document.getElementById("feedGrid");
  const empty = document.getElementById("feedEmptyState");
  if (!grid) return;

  if (!items || items.length === 0) {
    grid.innerHTML = "";
    if (empty) empty.classList.remove("hidden");
    return;
  }

  if (empty) empty.classList.add("hidden");

  grid.innerHTML = items.map((item) => {
    const isLost = item.report_type === "LOST";
    const statusColor = item.status === "RETURNED" ? "bg-blue-500/20 text-blue-400 border-blue-500/30" :
                        item.status === "VERIFIED" ? "bg-purple-500/20 text-purple-300 border-purple-500/30" :
                        item.status === "VERIFICATION_PENDING" ? "bg-amber-500/20 text-amber-300 border-amber-500/30" :
                        isLost ? "bg-rose-500/20 text-rose-300 border-rose-500/30" : "bg-emerald-500/20 text-emerald-300 border-emerald-500/30";

    const defaultImg = isLost
      ? "https://images.unsplash.com/photo-1590658268037-6bf12165a8df?w=600"
      : "https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=600";
    
    const displayImg = (item.image_urls && item.image_urls.length > 0) ? item.image_urls[0] : defaultImg;

    return `
      <div class="glass-panel rounded-2xl overflow-hidden flex flex-col hover:border-slate-600 transition duration-200" role="article" aria-label="${escapeHtml(item.item_name)} (${item.report_type})">
        <div class="relative h-44 w-full bg-slate-900 overflow-hidden cursor-pointer" onclick="openItemDetailModal(${item.id})">
          <img src="${escapeHtml(displayImg)}" alt="${escapeHtml(item.item_name)} photo" class="w-full h-full object-cover transform hover:scale-105 transition duration-300" />
          
          <div class="absolute top-2.5 left-2.5 flex items-center gap-1.5">
            <span class="px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider rounded-md ${isLost ? 'bg-rose-600 text-white' : 'bg-emerald-600 text-white'} shadow-md">
              ${isLost ? '🔴 LOST' : '🟢 FOUND'}
            </span>
            <span class="px-2 py-0.5 text-[10px] font-semibold bg-slate-900/80 backdrop-blur-md text-slate-300 rounded-md border border-slate-700">
              ${escapeHtml(item.category)}
            </span>
          </div>

          <div class="absolute top-2.5 right-2.5">
            <span class="px-2 py-0.5 text-[10px] font-bold uppercase rounded-md border ${statusColor}">
              Status: ${escapeHtml(item.status)}
            </span>
          </div>

          <div class="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent p-2.5 pt-6 flex items-center justify-between text-[11px] text-slate-200">
            <span class="flex items-center gap-1 truncate font-medium">
              <i data-lucide="map-pin" class="w-3 h-3 text-blue-400 flex-shrink-0" aria-hidden="true"></i>
              ${escapeHtml(item.campus_zone)}
            </span>
            <span class="text-[10px] text-slate-400">${escapeHtml(item.floor || '')}</span>
          </div>
        </div>

        <div class="p-4 flex-1 flex flex-col justify-between space-y-3">
          <div>
            <div class="flex items-center justify-between gap-1 mb-1">
              <h3 class="font-bold text-white text-sm truncate cursor-pointer hover:text-blue-400" onclick="openItemDetailModal(${item.id})">${escapeHtml(item.item_name)}</h3>
              ${item.color ? `<span class="text-[10px] px-1.5 py-0.5 bg-slate-800 rounded text-slate-400 border border-slate-700">${escapeHtml(item.color)}</span>` : ''}
            </div>

            <p class="text-xs text-slate-400 line-clamp-2 leading-relaxed">
              ${escapeHtml(item.description)}
            </p>
          </div>

          ${isLost && item.status !== 'RETURNED' ? `
            <div class="p-2 rounded-xl bg-blue-500/10 border border-blue-500/20 space-y-1">
              <div class="flex items-center justify-between text-[11px]">
                <span class="font-semibold text-blue-300 flex items-center gap-1">
                  <i data-lucide="sparkles" class="w-3 h-3 text-cyan-400" aria-hidden="true"></i> Recovery Chance
                </span>
                <span class="font-bold text-cyan-300">${item.recovery_probability}%</span>
              </div>
              <div class="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden" role="progressbar" aria-valuenow="${item.recovery_probability}" aria-valuemin="0" aria-valuemax="100">
                <div class="h-full bg-gradient-to-r from-blue-500 to-cyan-400 rounded-full" style="width: ${item.recovery_probability}%"></div>
              </div>
            </div>
          ` : ''}

          <div class="pt-2 border-t border-slate-800 flex items-center justify-between gap-2">
            <span class="text-[10px] text-slate-500 flex items-center gap-1">
              <i data-lucide="clock" class="w-3 h-3" aria-hidden="true"></i> ${timeAgo(item.date_time)}
            </span>

            <div class="flex gap-1.5">
              <button onclick="openItemDetailModal(${item.id})" class="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs" aria-label="View item details">
                Details
              </button>

              ${!isLost ? `
                <button onclick="openQrModal(${item.id}, '${escapeHtml(item.item_name)}')" class="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs" aria-label="View QR Security Tag">
                  <i data-lucide="qr-code" class="w-3.5 h-3.5" aria-hidden="true"></i>
                </button>
              ` : ''}

              ${!isLost && item.status === 'ACTIVE' ? `
                <button onclick="triggerClaimFromFeed(${item.id})" class="px-2.5 py-1 text-[11px] font-bold rounded-lg bg-purple-600 hover:bg-purple-500 text-white transition flex items-center gap-1 focus:outline-none focus:ring-1 focus:ring-purple-400" aria-label="Claim this item">
                  <i data-lucide="shield-check" class="w-3 h-3" aria-hidden="true"></i> Claim
                </button>
              ` : ''}
            </div>
          </div>
        </div>
      </div>
    `;
  }).join("");

  initIcons();
}

function filterFeedByZone(zoneName) {
  navigateTo("feed");
  const select = document.getElementById("feedZoneFilter");
  if (select) {
    select.value = zoneName;
    loadFeedItems();
  }
}

// ----------------- DETAILED ITEM MODAL -----------------

async function openItemDetailModal(itemId) {
  try {
    const res = await fetch(`/api/items/${itemId}?user_id=${currentUser.id}`);
    if (!res.ok) throw new Error("Item not found");
    const item = await res.json();
    activeDetailItem = item;

    document.getElementById("itemDetailModalTitle").textContent = item.item_name;
    const badge = document.getElementById("detailItemTypeBadge");
    badge.textContent = item.report_type;
    badge.className = `px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${item.report_type === 'LOST' ? 'bg-rose-500/20 text-rose-300' : 'bg-emerald-500/20 text-emerald-300'}`;

    const defaultImg = item.report_type === "LOST"
      ? "https://images.unsplash.com/photo-1590658268037-6bf12165a8df?w=600"
      : "https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=600";
    
    document.getElementById("detailItemImg").src = (item.image_urls && item.image_urls.length > 0) ? item.image_urls[0] : defaultImg;
    document.getElementById("detailItemCategory").textContent = item.category;
    document.getElementById("detailItemLocation").textContent = `${item.campus_zone} (${item.building}, ${item.floor})`;
    document.getElementById("detailItemTime").textContent = item.date_time;
    document.getElementById("detailItemCustody").textContent = item.current_item_location;
    document.getElementById("detailItemDescription").textContent = item.description;

    const vaultContainer = document.getElementById("detailPrivateVaultContainer");
    if (item.is_authorized_viewer && item.private_identification_details) {
      vaultContainer.classList.remove("hidden");
      document.getElementById("detailItemPrivateDetails").textContent = item.private_identification_details;
    } else {
      vaultContainer.classList.add("hidden");
    }

    const claimBtn = document.getElementById("detailClaimBtn");
    if (item.report_type === "FOUND" && item.status === "ACTIVE") {
      claimBtn.classList.remove("hidden");
      claimBtn.onclick = () => {
        closeItemDetailModal();
        triggerClaimFromFeed(item.id);
      };
    } else {
      claimBtn.classList.add("hidden");
    }

    document.getElementById("itemDetailModal").classList.remove("hidden");
    initIcons();

    // Load Recovery Intelligence Engine data for this item
    loadItemIntelligence(itemId);
  } catch (err) {
    console.error("Detail load error", err);
  }
}

function closeItemDetailModal() {
  document.getElementById("itemDetailModal").classList.add("hidden");
}

// ----------------- SMART MATCHES HUB -----------------

async function loadMatches() {
  try {
    const res = await fetch(`/api/matches?min_score=60&user_id=${currentUser.id}`);
    smartMatches = await res.json();

    const countEl = document.getElementById("nav-match-count");
    if (countEl) countEl.textContent = smartMatches.length;

    renderMatchesHub(smartMatches);
  } catch (err) {
    console.error("Matches load error", err);
  }
}

async function recalculateMatches() {
  showToast("Re-running multi-factor matching engine...", "info");
  try {
    const res = await fetch("/api/matches/recalculate", { method: "POST" });
    const data = await res.json();
    showToast(data.message, "success");
    loadMatches();
  } catch (e) {
    console.error(e);
  }
}

function renderMatchesHub(matches) {
  const container = document.getElementById("matchesContainer");
  if (!container) return;

  if (!matches || matches.length === 0) {
    container.innerHTML = `
      <div class="glass-panel p-12 rounded-3xl text-center space-y-3">
        <i data-lucide="sparkles" class="w-12 h-12 text-slate-500 mx-auto" aria-hidden="true"></i>
        <h3 class="text-base font-bold text-white">No active matches found</h3>
        <p class="text-xs text-slate-400">Reports are scanned automatically as new lost and found items are logged.</p>
      </div>
    `;
    initIcons();
    return;
  }

  container.innerHTML = matches.map((m) => {
    const score = Math.round(m.match_score);
    const scoreColor = score >= 85 ? "text-emerald-400" : score >= 65 ? "text-amber-400" : "text-slate-400";
    const strokeColor = score >= 85 ? "#10B981" : score >= 65 ? "#F59E0B" : "#94A3B8";
    const dashOffset = 283 - (283 * score) / 100;

    const lostImg = (m.lost_images && m.lost_images.length > 0) ? m.lost_images[0] : "https://images.unsplash.com/photo-1590658268037-6bf12165a8df?w=600";
    const foundImg = (m.found_images && m.found_images.length > 0) ? m.found_images[0] : "https://images.unsplash.com/photo-1590658268037-6bf12165a8df?w=600";

    return `
      <div class="glass-panel rounded-3xl p-6 sm:p-8 space-y-6 border border-slate-800/80 hover:border-slate-700 transition" role="region" aria-label="Smart Match: ${escapeHtml(m.lost_item_name)} and ${escapeHtml(m.found_item_name)}">
        
        <!-- Match Header with Circular Gauge -->
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
          <div class="flex items-center gap-4">
            
            <div class="relative w-16 h-16 flex-shrink-0 flex items-center justify-center" aria-label="Match score ${score} percent">
              <svg class="w-16 h-16" viewBox="0 0 100 100" role="img">
                <circle cx="50" cy="50" r="45" fill="none" stroke="#1E293B" stroke-width="8" />
                <circle cx="50" cy="50" r="45" fill="none" stroke="${strokeColor}" stroke-width="8" stroke-dasharray="283" stroke-dashoffset="${dashOffset}" stroke-linecap="round" class="match-ring-circle" />
              </svg>
              <div class="absolute inset-0 flex flex-col items-center justify-center">
                <span class="text-base font-extrabold ${scoreColor}">${score}%</span>
              </div>
            </div>

            <div>
              <div class="flex items-center gap-2">
                <span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold ${score >= 85 ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'}">
                  ${m.match_level_label}
                </span>
                <span class="text-xs text-slate-400">Match #${m.id}</span>
              </div>
              <h3 class="text-lg font-bold text-white mt-1">${escapeHtml(m.lost_item_name)} ↔ ${escapeHtml(m.found_item_name)}</h3>
            </div>
          </div>

          <div class="flex items-center gap-2">
            <button onclick="openClaimModalFromMatch(${m.lost_report_id}, ${m.found_report_id}, ${m.id}, '${escapeHtml(m.found_item_name)}')" class="px-4 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-xs shadow-md shadow-purple-500/20 transition flex items-center gap-1.5 focus:outline-none focus:ring-2 focus:ring-purple-400" aria-label="Verify and claim this matching item">
              <i data-lucide="sparkles" class="w-3.5 h-3.5" aria-hidden="true"></i>
              <span>This Might Be My Item</span>
            </button>
          </div>
        </div>

        <!-- Side-by-Side Item Comparison -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          
          <div class="p-4 rounded-2xl bg-rose-500/5 border border-rose-500/20 space-y-3">
            <div class="flex items-center justify-between">
              <span class="text-xs font-bold text-rose-400 flex items-center gap-1.5">
                <span class="w-2 h-2 rounded-full bg-rose-400" aria-hidden="true"></span> Reported Lost
              </span>
              <span class="text-[11px] text-slate-400">${escapeHtml(m.lost_user_name)}</span>
            </div>

            <div class="flex gap-3">
              <img src="${escapeHtml(lostImg)}" alt="Lost ${escapeHtml(m.lost_item_name)}" class="w-16 h-16 rounded-xl object-cover border border-rose-500/30" />
              <div class="space-y-1 text-xs">
                <p class="font-bold text-white">${escapeHtml(m.lost_item_name)}</p>
                <p class="text-[11px] text-slate-400 flex items-center gap-1">
                  <i data-lucide="map-pin" class="w-3 h-3 text-rose-400" aria-hidden="true"></i> ${escapeHtml(m.lost_zone)}
                </p>
                <p class="text-[11px] text-slate-400 flex items-center gap-1">
                  <i data-lucide="clock" class="w-3 h-3 text-slate-400" aria-hidden="true"></i> Lost: ${escapeHtml(m.lost_date_time)}
                </p>
              </div>
            </div>

            <p class="text-xs text-slate-300 bg-slate-900/60 p-2.5 rounded-xl italic">
              "${escapeHtml(m.lost_description)}"
            </p>
          </div>

          <div class="p-4 rounded-2xl bg-emerald-500/5 border border-emerald-500/20 space-y-3">
            <div class="flex items-center justify-between">
              <span class="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                <span class="w-2 h-2 rounded-full bg-emerald-400" aria-hidden="true"></span> Reported Found
              </span>
              <span class="text-[11px] text-slate-400">Custody: ${escapeHtml(m.found_current_location)}</span>
            </div>

            <div class="flex gap-3">
              <img src="${escapeHtml(foundImg)}" alt="Found ${escapeHtml(m.found_item_name)}" class="w-16 h-16 rounded-xl object-cover border border-emerald-500/30" />
              <div class="space-y-1 text-xs">
                <p class="font-bold text-white">${escapeHtml(m.found_item_name)}</p>
                <p class="text-[11px] text-slate-400 flex items-center gap-1">
                  <i data-lucide="map-pin" class="w-3 h-3 text-emerald-400" aria-hidden="true"></i> ${escapeHtml(m.found_zone)}
                </p>
                <p class="text-[11px] text-slate-400 flex items-center gap-1">
                  <i data-lucide="clock" class="w-3 h-3 text-slate-400" aria-hidden="true"></i> Found: ${escapeHtml(m.found_date_time)}
                </p>
              </div>
            </div>

            <p class="text-xs text-slate-300 bg-slate-900/60 p-2.5 rounded-xl italic">
              "${escapeHtml(m.found_description)}"
            </p>
          </div>

        </div>

        <!-- Explainable AI Reasons & Multi-factor Progress Breakdown -->
        <div class="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-4">
          <div>
            <h4 class="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-1.5 mb-2">
              <i data-lucide="check-circle" class="w-4 h-4 text-cyan-400" aria-hidden="true"></i> Why This Is A Match (Explainable AI Engine)
            </h4>
            
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
              ${m.match_reasons.map((r) => `
                <div class="flex items-center gap-2 text-xs text-slate-300 bg-slate-950/60 px-3 py-2 rounded-xl border border-slate-800">
                  <span class="text-emerald-400 font-bold" aria-hidden="true">✓</span>
                  <span>${escapeHtml(r.replace('✓', '').trim())}</span>
                </div>
              `).join("")}
            </div>
          </div>

          <div class="pt-3 border-t border-slate-800 grid grid-cols-2 sm:grid-cols-5 gap-3 text-[11px]">
            <div>
              <div class="flex justify-between text-slate-400 mb-1">
                <span>Name & Cat (30%)</span>
                <span class="font-bold text-white">${m.item_score}%</span>
              </div>
              <div class="h-1 bg-slate-800 rounded-full overflow-hidden" role="progressbar" aria-valuenow="${m.item_score}" aria-valuemin="0" aria-valuemax="100">
                <div class="h-full bg-blue-500 rounded-full" style="width: ${m.item_score}%"></div>
              </div>
            </div>

            <div>
              <div class="flex justify-between text-slate-400 mb-1">
                <span>Description (20%)</span>
                <span class="font-bold text-white">${m.description_score}%</span>
              </div>
              <div class="h-1 bg-slate-800 rounded-full overflow-hidden" role="progressbar" aria-valuenow="${m.description_score}" aria-valuemin="0" aria-valuemax="100">
                <div class="h-full bg-cyan-500 rounded-full" style="width: ${m.description_score}%"></div>
              </div>
            </div>

            <div>
              <div class="flex justify-between text-slate-400 mb-1">
                <span>Location (20%)</span>
                <span class="font-bold text-white">${m.location_score}%</span>
              </div>
              <div class="h-1 bg-slate-800 rounded-full overflow-hidden" role="progressbar" aria-valuenow="${m.location_score}" aria-valuemin="0" aria-valuemax="100">
                <div class="h-full bg-purple-500 rounded-full" style="width: ${m.location_score}%"></div>
              </div>
            </div>

            <div>
              <div class="flex justify-between text-slate-400 mb-1">
                <span>Time Decay (15%)</span>
                <span class="font-bold text-white">${m.time_score}%</span>
              </div>
              <div class="h-1 bg-slate-800 rounded-full overflow-hidden" role="progressbar" aria-valuenow="${m.time_score}" aria-valuemin="0" aria-valuemax="100">
                <div class="h-full bg-amber-500 rounded-full" style="width: ${m.time_score}%"></div>
              </div>
            </div>

            <div class="col-span-2 sm:col-span-1">
              <div class="flex justify-between text-slate-400 mb-1">
                <span>Color & Brand (10%)</span>
                <span class="font-bold text-white">${m.color_brand_score}%</span>
              </div>
              <div class="h-1 bg-slate-800 rounded-full overflow-hidden" role="progressbar" aria-valuenow="${m.color_brand_score}" aria-valuemin="0" aria-valuemax="100">
                <div class="h-full bg-emerald-500 rounded-full" style="width: ${m.color_brand_score}%"></div>
              </div>
            </div>
          </div>
        </div>

      </div>
    `;
  }).join("");

  initIcons();
}

// ----------------- MULTI-STEP REPORT WIZARD & FILE DRAG-AND-DROP -----------------

function openReportModal(type) {
  currentWizardType = type;
  currentWizardStep = 1;

  const modal = document.getElementById("reportModal");
  const title = document.getElementById("reportModalTitle");
  const tag = document.getElementById("reportModalTag");
  const custodySec = document.getElementById("foundCustodySection");

  if (type === "LOST") {
    title.textContent = "Report a Lost Item";
    tag.textContent = "🔴 Lost Item Form";
    tag.className = "px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-rose-500/20 text-rose-300 border border-rose-500/30";
    if (custodySec) custodySec.classList.add("hidden");
  } else {
    title.textContent = "Report a Found Item";
    tag.textContent = "🟢 Found Item Form";
    tag.className = "px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/30";
    if (custodySec) custodySec.classList.remove("hidden");
  }

  const now = new Date();
  const dateStr = now.toISOString().slice(0, 16).replace("T", " ");
  document.getElementById("repDateTime").value = dateStr;

  goToWizardStep(1);
  modal.classList.remove("hidden");
}

function closeReportModal() {
  document.getElementById("reportModal").classList.add("hidden");
}

function goToWizardStep(step) {
  currentWizardStep = step;
  [1, 2, 3].forEach((s) => {
    const el = document.getElementById(`wizardStep${s}`);
    const lbl = document.getElementById(`stepLabel${s}`);
    if (el) el.classList.toggle("hidden", s !== step);
    if (lbl) {
      if (s === step) {
        lbl.className = "font-bold text-blue-400";
      } else if (s < step) {
        lbl.className = "font-semibold text-emerald-400";
      } else {
        lbl.className = "font-normal text-slate-500";
      }
    }
  });
  initIcons();
}

function setupFileDropZone() {
  const dropZone = document.getElementById("fileDropZone");
  if (!dropZone) return;

  ["dragenter", "dragover"].forEach((eventName) => {
    dropZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.classList.add("border-blue-400", "bg-blue-500/10");
    });
  });

  ["dragleave", "drop"].forEach((eventName) => {
    dropZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.classList.remove("border-blue-400", "bg-blue-500/10");
    });
  });

  dropZone.addEventListener("drop", (e) => {
    const dt = e.dataTransfer;
    const files = dt.files;
    if (files.length > 0) {
      uploadSelectedFile(files[0]);
    }
  });
}

function handleDirectFileUpload(e) {
  const file = e.target.files[0];
  if (file) {
    uploadSelectedFile(file);
  }
}

async function uploadSelectedFile(file) {
  if (file.size > 5 * 1024 * 1024) {
    showToast("File size exceeds 5MB limit.", "error");
    return;
  }

  showToast("Uploading image...", "info");
  const formData = new FormData();
  formData.append("file", file);

  try {
    const res = await fetch("/api/upload", {
      method: "POST",
      body: formData
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || "Upload failed");
    }

    const data = await res.json();
    document.getElementById("repImage").value = data.url;

    // Show preview
    const previewContainer = document.getElementById("uploadPreviewContainer");
    const previewImg = document.getElementById("uploadPreviewImg");
    const fileNameEl = document.getElementById("uploadFileName");

    previewImg.src = data.url;
    fileNameEl.textContent = file.name;
    previewContainer.classList.remove("hidden");

    showToast("Photo uploaded & verified!", "success");
  } catch (err) {
    console.error("Upload error", err);
    showToast(err.message, "error");
  }
}

function fillPreset(presetKey) {
  if (presetKey === "EARBUDS") {
    document.getElementById("repItemName").value = "Black JBL Wireless Earbuds";
    document.getElementById("repCategory").value = "Electronics";
    document.getElementById("repBrand").value = "JBL";
    document.getElementById("repColor").value = "Black";
    document.getElementById("repDescription").value = "Black JBL earbuds in a small matte charging case with a small scratch on the right side.";
    document.getElementById("repZone").value = "Central Library";
    document.getElementById("repBuilding").value = "Library 2nd Floor";
    document.getElementById("repSpot").value = "Desk 42 near window";
    document.getElementById("repPrivateDetails").value = "Small red sticker inside the charging case.";
    document.getElementById("repImage").value = "https://images.unsplash.com/photo-1590658268037-6bf12165a8df?w=600";
  } else if (presetKey === "MACBOOK") {
    document.getElementById("repItemName").value = "Space Gray MacBook Air M2";
    document.getElementById("repCategory").value = "Electronics";
    document.getElementById("repBrand").value = "Apple";
    document.getElementById("repColor").value = "Space Gray";
    document.getElementById("repDescription").value = "13-inch Space Gray Apple laptop with transparent hardshell cover left after study group.";
    document.getElementById("repZone").value = "Student Cafeteria";
    document.getElementById("repBuilding").value = "Dining Hall 1st Floor";
    document.getElementById("repSpot").value = "Juice Bar Booth Table 4";
    document.getElementById("repPrivateDetails").value = "GitHub Octocat sticker on palmrest, password hint: BlueCosmos";
    document.getElementById("repImage").value = "https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=600";
  } else if (presetKey === "WALLET") {
    document.getElementById("repItemName").value = "Brown Leather Coach Wallet";
    document.getElementById("repCategory").value = "Wallet";
    document.getElementById("repBrand").value = "Coach";
    document.getElementById("repColor").value = "Brown";
    document.getElementById("repDescription").value = "Genuine brown leather bifold wallet with contrast beige stitching.";
    document.getElementById("repZone").value = "Main Auditorium";
    document.getElementById("repBuilding").value = "Arts Complex Ground";
    document.getElementById("repSpot").value = "Row G Seat 14";
    document.getElementById("repPrivateDetails").value = "California Driver's License ending 9821, gym card #441, $45 cash inside.";
    document.getElementById("repImage").value = "https://images.unsplash.com/photo-1627123424574-724758594e93?w=600";
  }
}

async function handleItemReportSubmit(e) {
  e.preventDefault();

  const payload = {
    report_type: currentWizardType,
    item_name: document.getElementById("repItemName").value,
    category: document.getElementById("repCategory").value,
    brand: document.getElementById("repBrand").value,
    color: document.getElementById("repColor").value,
    description: document.getElementById("repDescription").value,
    campus_zone: document.getElementById("repZone").value,
    building: document.getElementById("repBuilding").value,
    floor: document.getElementById("repSpot").value || "Ground",
    approximate_location: document.getElementById("repSpot").value,
    date_time: document.getElementById("repDateTime").value,
    private_identification_details: document.getElementById("repPrivateDetails").value,
    image_urls: document.getElementById("repImage").value ? [document.getElementById("repImage").value] : [],
    current_item_location: document.getElementById("repCustody")?.value || "With Finder"
  };

  try {
    showToast("Processing report with AI Matching Engine...", "info");
    const res = await fetch(`/api/items?user_id=${currentUser.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || "Submission failed");
    }

    const data = await res.json();
    closeReportModal();

    if (data.matches && data.matches.length > 0) {
      showToast(`🎯 AI MATCH FOUND! ${data.matches.length} high-confidence candidate(s) detected.`, "success");
      navigateTo("matches");
    } else {
      showToast(data.message, "success");
      navigateTo("feed");
    }
  } catch (err) {
    console.error("Submission error", err);
    showToast(err.message || "Error saving report.", "error");
  }
}

// ----------------- OWNERSHIP VERIFICATION & CLAIM -----------------

function triggerClaimFromFeed(foundItemId) {
  const item = feedItems.find((i) => i.id === foundItemId);
  if (!item) return;

  openClaimModalFromMatch(1, foundItemId, null, item.item_name);
}

function openClaimModalFromMatch(lostId, foundId, matchId, itemName) {
  currentClaimTarget = { lostId, foundId, matchId, itemName };
  
  const summary = document.getElementById("claimItemSummary");
  summary.innerHTML = `
    <p class="font-bold text-white">Target Item: ${escapeHtml(itemName || 'Campus Item')}</p>
    <p class="text-slate-400">Match Ref: #${matchId || 'Direct'} • Claimant: ${escapeHtml(currentUser.name)}</p>
  `;

  document.getElementById("claimAnswerInput").value = "";
  const resultBox = document.getElementById("claimEvaluationResult");
  resultBox.classList.add("hidden");

  document.getElementById("claimModal").classList.remove("hidden");
}

function closeClaimModal() {
  document.getElementById("claimModal").classList.add("hidden");
}

function fillClaimDemoAnswer() {
  document.getElementById("claimAnswerInput").value = "Small red sticker inside the charging case.";
}

async function submitOwnershipClaim() {
  if (!currentClaimTarget) return;
  const answer = document.getElementById("claimAnswerInput").value.trim();

  if (!answer) {
    showToast("Please provide verification proof before submitting.", "warning");
    return;
  }

  const payload = {
    match_id: currentClaimTarget.matchId,
    lost_report_id: currentClaimTarget.lostId,
    found_report_id: currentClaimTarget.foundId,
    verification_answer: answer
  };

  try {
    const res = await fetch(`/api/claims?user_id=${currentUser.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await res.json();

    const resultBox = document.getElementById("claimEvaluationResult");
    resultBox.classList.remove("hidden");

    if (data.verification_score >= 85) {
      resultBox.className = "p-4 rounded-2xl space-y-2 border bg-emerald-500/10 border-emerald-500/30 text-emerald-300";
      resultBox.innerHTML = `
        <div class="flex items-center justify-between">
          <span class="font-bold text-sm">🎉 Ownership Confidence: ${data.verification_score}%</span>
          <span class="text-xs px-2 py-0.5 rounded bg-emerald-500/20">${data.status}</span>
        </div>
        <p class="text-xs text-slate-300">Proof verified against hidden marks. You are clear to arrange a safe physical handover.</p>
        <button onclick="openHandoverFromClaim(${data.claim_id})" class="mt-2 w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs transition focus:outline-none focus:ring-2 focus:ring-emerald-400">
          Schedule Safe Handover Now 🏛️
        </button>
      `;
    } else {
      resultBox.className = "p-4 rounded-2xl space-y-2 border bg-amber-500/10 border-amber-500/30 text-amber-300";
      resultBox.innerHTML = `
        <div class="flex items-center justify-between">
          <span class="font-bold text-sm">🟡 Ownership Confidence: ${data.verification_score}%</span>
          <span class="text-xs px-2 py-0.5 rounded bg-amber-500/20">${data.status}</span>
        </div>
        <p class="text-xs text-slate-300">${escapeHtml(data.notes || 'Under review by Campus Security officer.')}</p>
      `;
    }

    showToast("Verification answer evaluated.", "success");
    loadMatches();
  } catch (err) {
    console.error("Claim error", err);
  }
}

// ----------------- SAFE HANDOVER -----------------

function openHandoverFromClaim(claimId) {
  closeClaimModal();
  currentHandoverTarget = {
    claimId: claimId,
    lostId: currentClaimTarget ? currentClaimTarget.lostId : 1,
    foundId: currentClaimTarget ? currentClaimTarget.foundId : 11,
    matchId: currentClaimTarget ? currentClaimTarget.matchId : 1
  };
  document.getElementById("handoverModal").classList.remove("hidden");
}

function closeHandoverModal() {
  document.getElementById("handoverModal").classList.add("hidden");
}

async function submitHandoverSchedule() {
  if (!currentHandoverTarget) return;

  const payload = {
    match_id: currentHandoverTarget.matchId,
    claim_id: currentHandoverTarget.claimId,
    lost_report_id: currentHandoverTarget.lostId,
    found_report_id: currentHandoverTarget.foundId,
    location: document.getElementById("handoverStation").value,
    scheduled_time: document.getElementById("handoverTime").value,
    notes: document.getElementById("handoverNotes").value
  };

  try {
    const res = await fetch(`/api/handovers?user_id=${currentUser.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    closeHandoverModal();
    showToast("🎉 Handover scheduled at campus station!", "success");
    navigateTo("dashboard");
  } catch (e) {
    console.error(e);
  }
}

async function confirmHandoverParty(handoverId, party) {
  try {
    const res = await fetch(`/api/handovers/${handoverId}/confirm?user_id=${currentUser.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ party: party })
    });
    const data = await res.json();

    if (data.is_completed) {
      triggerConfetti();
      showToast("🎉 ITEM RETURNED SUCCESSFULLY! Reconnection complete.", "success");
    } else {
      showToast("Handover confirmation registered.", "info");
    }

    if (activeView === "admin") loadAdminDashboard();
    if (activeView === "dashboard") loadUserDashboard();
  } catch (err) {
    console.error(err);
  }
}

// ----------------- QR CODE PHYSICAL TAG -----------------

function openQrModal(itemId, itemName) {
  const qrImg = document.getElementById("qrImageElement");
  const nameEl = document.getElementById("qrItemName");
  qrImg.src = `/api/qr/${itemId}`;
  nameEl.textContent = itemName;
  document.getElementById("qrModal").classList.remove("hidden");
}

function closeQrModal() {
  document.getElementById("qrModal").classList.add("hidden");
}

// ----------------- USER DASHBOARD -----------------

async function loadUserDashboard() {
  try {
    const resLost = await fetch(`/api/items?report_type=LOST&user_id=${currentUser.id}`);
    const lostItems = await resLost.json();

    const resFound = await fetch(`/api/items?report_type=FOUND&user_id=${currentUser.id}`);
    const foundItems = await resFound.json();

    const lostList = document.getElementById("userLostList");
    const foundList = document.getElementById("userFoundList");

    if (lostList) {
      if (lostItems.length === 0) {
        lostList.innerHTML = `<p class="text-xs text-slate-500 py-3">No active lost reports.</p>`;
      } else {
        lostList.innerHTML = lostItems.map((item) => `
          <div class="p-3.5 rounded-2xl bg-slate-900/80 border border-slate-800 flex items-center justify-between gap-3">
            <div>
              <p class="font-bold text-white text-xs">${escapeHtml(item.item_name)}</p>
              <p class="text-[11px] text-slate-400">${escapeHtml(item.campus_zone)} • Status: <span class="font-bold text-blue-400">${item.status}</span></p>
            </div>
            <span class="text-xs font-bold text-cyan-400 bg-cyan-500/10 px-2 py-1 rounded-lg border border-cyan-500/20">${item.recovery_probability}% Recovery</span>
          </div>
        `).join("");
      }
    }

    if (foundList) {
      if (foundItems.length === 0) {
        foundList.innerHTML = `<p class="text-xs text-slate-500 py-3">No active found reports.</p>`;
      } else {
        foundList.innerHTML = foundItems.map((item) => `
          <div class="p-3.5 rounded-2xl bg-slate-900/80 border border-slate-800 flex items-center justify-between gap-3">
            <div>
              <p class="font-bold text-white text-xs">${escapeHtml(item.item_name)}</p>
              <p class="text-[11px] text-slate-400">Custody: ${escapeHtml(item.current_item_location)}</p>
            </div>
            <button onclick="openQrModal(${item.id}, '${escapeHtml(item.item_name)}')" class="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs focus:outline-none">QR Tag</button>
          </div>
        `).join("");
      }
    }

    initIcons();
  } catch (err) {
    console.error(err);
  }
}

// ----------------- SECURITY & ADMIN DASHBOARD -----------------

async function loadAdminDashboard() {
  try {
    const resClaims = await fetch(`/api/claims?user_id=${currentUser.id}`);
    const claims = await resClaims.json();

    const tbodyClaims = document.getElementById("adminClaimsTableBody");
    if (tbodyClaims) {
      if (claims.length === 0) {
        tbodyClaims.innerHTML = `<tr><td colspan="6" class="p-4 text-center text-slate-500">No claims awaiting moderation.</td></tr>`;
      } else {
        tbodyClaims.innerHTML = claims.map((c) => `
          <tr class="hover:bg-slate-900/40 transition">
            <td class="p-3 font-semibold text-white">${escapeHtml(c.claimant_name)}</td>
            <td class="p-3 text-slate-300">${escapeHtml(c.lost_item_name)}</td>
            <td class="p-3"><span class="px-2 py-0.5 rounded font-bold ${c.verification_score >= 85 ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300'}">${c.verification_score}%</span></td>
            <td class="p-3 text-slate-400 italic max-w-xs truncate">${escapeHtml(c.verification_answers?.user_answer || 'N/A')}</td>
            <td class="p-3 font-bold text-cyan-400">${c.status}</td>
            <td class="p-3 flex gap-1.5">
              ${c.status !== 'APPROVED' ? `
                <button onclick="handleAdminClaimReview(${c.id}, 'APPROVE')" class="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[10px] focus:outline-none focus:ring-1 focus:ring-emerald-400">Approve</button>
                <button onclick="handleAdminClaimReview(${c.id}, 'REJECT')" class="px-2 py-1 rounded bg-rose-600 hover:bg-rose-500 text-white font-bold text-[10px] focus:outline-none focus:ring-1 focus:ring-rose-400">Reject</button>
              ` : '<span class="text-emerald-400 font-bold">Approved ✓</span>'}
            </td>
          </tr>
        `).join("");
      }
    }

    const resHandovers = await fetch("/api/handovers");
    const handovers = await resHandovers.json();

    const tbodyHandovers = document.getElementById("adminHandoversTableBody");
    if (tbodyHandovers) {
      if (handovers.length === 0) {
        tbodyHandovers.innerHTML = `<tr><td colspan="6" class="p-4 text-center text-slate-500">No scheduled handovers.</td></tr>`;
      } else {
        tbodyHandovers.innerHTML = handovers.map((h) => `
          <tr class="hover:bg-slate-900/40 transition">
            <td class="p-3 font-semibold text-white">${escapeHtml(h.lost_item_name)}</td>
            <td class="p-3 text-slate-300">${escapeHtml(h.location)}</td>
            <td class="p-3 text-slate-300">${escapeHtml(h.owner_name)} (${h.owner_confirmed ? '✓ Confirmed' : 'Pending'})</td>
            <td class="p-3 text-slate-300">${escapeHtml(h.finder_name)} (${h.finder_confirmed ? '✓ Confirmed' : 'Pending'})</td>
            <td class="p-3"><span class="px-2 py-0.5 rounded font-bold ${h.status === 'COMPLETED' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300'}">${h.status}</span></td>
            <td class="p-3">
              ${h.status !== 'COMPLETED' ? `
                <button onclick="confirmHandoverParty(${h.id}, 'moderator')" class="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded text-[10px] focus:outline-none focus:ring-1 focus:ring-emerald-400">
                  Confirm Return 🎉
                </button>
              ` : '<span class="text-emerald-400 font-bold">Returned 🎉</span>'}
            </td>
          </tr>
        `).join("");
      }
    }

  } catch (err) {
    console.error("Admin load error", err);
  }
}

async function handleAdminClaimReview(claimId, action) {
  try {
    const res = await fetch(`/api/claims/${claimId}/review?user_id=${currentUser.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: action, notes: `Reviewed by ${currentUser.name}` })
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || "Review failed");
    }

    const data = await res.json();
    showToast(data.message, "success");
    loadAdminDashboard();
  } catch (e) {
    console.error(e);
    showToast(e.message, "error");
  }
}

// ----------------- ANALYTICS & CHARTS -----------------

async function loadAnalytics() {
  try {
    const res = await fetch("/api/analytics/overview");
    const data = await res.json();

    renderCategoryChart(data.category_distribution);
    renderHourlyChart(data.hourly_peaks);
  } catch (err) {
    console.error("Analytics load error", err);
  }
}

function renderCategoryChart(catData) {
  const ctx = document.getElementById("categoryChart");
  if (!ctx) return;

  if (categoryChartInstance) {
    categoryChartInstance.destroy();
  }

  const labels = (catData || []).map((c) => c.category);
  const values = (catData || []).map((c) => c.count);

  categoryChartInstance = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: labels,
      datasets: [{
        data: values,
        backgroundColor: ["#3B82F6", "#06B6D4", "#8B5CF6", "#F59E0B", "#10B981", "#EC4899", "#6366F1", "#14B8A6", "#F43F5E", "#64748B"],
        borderColor: "#0F172A",
        borderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: "right",
          labels: { color: "#CBD5E1", font: { size: 11 } }
        }
      }
    }
  });
}

function renderHourlyChart(hourlyData) {
  const ctx = document.getElementById("hourlyChart");
  if (!ctx) return;

  if (hourlyChartInstance) {
    hourlyChartInstance.destroy();
  }

  const labels = (hourlyData || []).map((h) => h.hour);
  const values = (hourlyData || []).map((h) => h.losses);

  hourlyChartInstance = new Chart(ctx, {
    type: "line",
    data: {
      labels: labels,
      datasets: [{
        label: "Reported Item Loss Frequency",
        data: values,
        borderColor: "#38BDF8",
        backgroundColor: "rgba(56, 189, 248, 0.15)",
        fill: true,
        tension: 0.4,
        pointBackgroundColor: "#0284C7",
        pointRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { ticks: { color: "#94A3B8" }, grid: { color: "rgba(255,255,255,0.05)" } },
        y: { ticks: { color: "#94A3B8" }, grid: { color: "rgba(255,255,255,0.05)" } }
      },
      plugins: {
        legend: { display: false }
      }
    }
  });
}

// ----------------- 🚀 1-CLICK HACKATHON DEMO MODE -----------------

function openDemoModal() {
  document.getElementById("demoModal").classList.remove("hidden");
  document.getElementById("demoStepProgress").innerHTML = `
    <div class="text-center py-6 space-y-3">
      <div class="w-14 h-14 rounded-2xl bg-purple-500/20 border border-purple-500/30 text-purple-300 flex items-center justify-center mx-auto">
        <i data-lucide="sparkles" class="w-7 h-7 animate-pulse" aria-hidden="true"></i>
      </div>
      <h4 class="font-bold text-white text-base">Campus Reconnection Simulator</h4>
      <p class="text-xs text-slate-400 max-w-md mx-auto">
        Click below to simulate the end-to-end journey: <br />
        <span class="text-slate-200 font-semibold">Lost Report → Multi-Factor AI Analysis → 91% Match → Private Challenge Quiz → Safe Handover → Returned</span>
      </p>
    </div>
  `;
  initIcons();
}

function closeDemoModal() {
  document.getElementById("demoModal").classList.add("hidden");
}

async function startAutomatedDemoSequence() {
  const btn = document.getElementById("runDemoSequenceBtn");
  btn.disabled = true;
  btn.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 animate-spin" aria-hidden="true"></i> Running Autonomous Simulation...`;

  const container = document.getElementById("demoStepProgress");

  // Step 1
  container.innerHTML = `
    <div class="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 space-y-1 animate-in fade-in">
      <p class="text-xs font-bold text-rose-400">Step 1: Student Alex Rivera logs lost item</p>
      <p class="text-[11px] text-slate-300">"Black JBL Wireless Earbuds" lost at Central Library, 2nd Floor. Hidden mark saved to encrypted vault.</p>
    </div>
  `;
  await delay(1200);

  // Step 2
  container.innerHTML += `
    <div class="p-3.5 rounded-xl bg-blue-500/10 border border-blue-500/20 space-y-1 animate-in fade-in">
      <div class="flex items-center justify-between text-xs font-bold text-blue-400">
        <span>Step 2: AI Matching Engine Scanning Active Reports...</span>
        <span class="animate-pulse">Analyzing 6 Weights</span>
      </div>
      <p class="text-[11px] text-slate-300">Comparing item category, semantic tokens, spatial proximity matrix, time decay, and color taxonomy.</p>
    </div>
  `;
  await delay(1400);

  // Step 3
  container.innerHTML += `
    <div class="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 space-y-1 animate-in fade-in">
      <div class="flex items-center justify-between text-xs font-bold text-amber-300">
        <span>Step 3: 🎯 91% POSSIBLE MATCH DETECTED</span>
        <span class="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[10px]">VERY STRONG MATCH</span>
      </div>
      <p class="text-[11px] text-slate-300">Found by Officer Marcus at Central Library Entrance (35 mins after loss report).</p>
      <div class="text-[10px] text-slate-400 space-y-0.5 pt-1">
        <p>✓ Same Category (Electronics)</p>
        <p>✓ Same Campus Zone (Central Library)</p>
        <p>✓ Matching Color & Brand (Black JBL)</p>
      </div>
    </div>
  `;
  await delay(1600);

  // Step 4
  container.innerHTML += `
    <div class="p-3.5 rounded-xl bg-purple-500/10 border border-purple-500/20 space-y-1 animate-in fade-in">
      <p class="text-xs font-bold text-purple-300">Step 4: Dynamic Ownership Challenge Quiz</p>
      <p class="text-[11px] text-slate-300">Alex submitted private proof: "Small red sticker inside charging case."</p>
      <p class="text-[10px] text-emerald-400 font-bold">🟢 AI Ownership Confidence Score: 95% (Approved)</p>
    </div>
  `;
  await delay(1400);

  // Step 5
  container.innerHTML += `
    <div class="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 space-y-1 animate-in fade-in">
      <p class="text-xs font-bold text-emerald-400">Step 5: Custody Handover & Dual Confirmation</p>
      <p class="text-[11px] text-slate-300">Location: Campus Security Office (Library Entrance Desk). Verified and signed off.</p>
    </div>
  `;
  await delay(1200);

  // Step 6
  try {
    const res = await fetch("/api/demo/run-scenario", { method: "POST" });
    const data = await res.json();

    triggerConfetti();

    container.innerHTML += `
      <div class="p-4 rounded-2xl bg-gradient-to-r from-emerald-600/30 via-teal-600/30 to-blue-600/30 border border-emerald-400/40 text-center space-y-2 animate-in zoom-in-95">
        <h4 class="text-base font-extrabold text-white">🎉 ITEM SUCCESSFULLY RETURNED!</h4>
        <p class="text-xs text-emerald-300 font-semibold italic">"${data.scenario.tagline}"</p>
        <div class="pt-2 flex justify-center gap-2">
          <button onclick="closeDemoModal(); navigateTo('matches');" class="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-400">View Live Matches</button>
          <button onclick="closeDemoModal(); navigateTo('feed');" class="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-400">View Feed</button>
        </div>
      </div>
    `;

    loadFeedItems();
    loadMatches();
  } catch (err) {
    console.error(err);
  }

  btn.disabled = false;
  btn.innerHTML = `<i data-lucide="rotate-ccw" class="w-4 h-4" aria-hidden="true"></i> Run Demo Again`;
  initIcons();
}

// ----------------- LIVE ACTIVITY FEED (Top 5 Feature) -----------------

async function loadActivityFeed() {
  const ticker = document.getElementById("liveActivityTicker");
  if (!ticker) return;

  try {
    const res = await fetch("/api/activity/feed");
    const events = await res.json();

    if (!events || events.length === 0) {
      ticker.innerHTML = `<p class="text-xs text-slate-500 col-span-3 text-center py-4">No activity yet. Reports and matches will appear here in real time.</p>`;
      return;
    }

    ticker.innerHTML = events.slice(0, 6).map((ev) => {
      const iconMap = {
        "report": "file-plus",
        "match": "git-merge",
        "claim": "shield-check",
        "handover": "handshake",
        "returned": "check-circle-2"
      };
      const colorMap = {
        "report": "blue",
        "match": "amber",
        "claim": "purple",
        "handover": "emerald",
        "returned": "cyan"
      };
      const c = colorMap[ev.event_type] || "slate";
      const icon = iconMap[ev.event_type] || "activity";

      return `
        <div class="activity-item flex items-start gap-3 p-3.5 rounded-xl bg-slate-900/70 border border-slate-800 hover:border-slate-700 transition">
          <div class="w-8 h-8 rounded-lg bg-${c}-500/15 text-${c}-400 flex items-center justify-center flex-shrink-0 mt-0.5">
            <i data-lucide="${icon}" class="w-4 h-4" aria-hidden="true"></i>
          </div>
          <div class="min-w-0">
            <p class="text-xs font-semibold text-slate-200 leading-snug truncate">${escapeHtml(ev.title)}</p>
            <p class="text-[11px] text-slate-400 mt-0.5 leading-relaxed">${escapeHtml(ev.description)}</p>
            <div class="flex items-center gap-2 mt-1">
              <span class="text-[10px] text-${c}-400 font-semibold">${escapeHtml(ev.campus_zone || "Campus")}</span>
              <span class="text-[10px] text-slate-600">•</span>
              <span class="text-[10px] text-slate-500">${timeAgo(ev.created_at)}</span>
            </div>
          </div>
        </div>
      `;
    }).join("");

    initIcons();
  } catch (err) {
    console.warn("Activity feed load error:", err);
    const ticker = document.getElementById("liveActivityTicker");
    if (ticker) ticker.innerHTML = `<p class="text-xs text-slate-500 col-span-3 text-center py-2">Activity stream unavailable.</p>`;
  }
}

// ----------------- RECOVERY INTELLIGENCE ENGINE (Top 5 Feature) -----------------

async function loadItemIntelligence(itemId) {
  // Populate the Recovery Intelligence card inside the item detail modal
  const card = document.getElementById("detailIntelligenceCard");
  const nextActionMsg = document.getElementById("detailNextActionMsg");
  const timelineContainer = document.getElementById("detailTimelineContainer");
  const highValueBadge = document.getElementById("detailHighValueBadge");

  if (!card) return;

  // Show loading state
  if (nextActionMsg) nextActionMsg.textContent = "Analyzing recovery intelligence...";
  if (timelineContainer) timelineContainer.innerHTML = `<div class="text-xs text-slate-500 animate-pulse">Loading smart recovery timeline...</div>`;

  try {
    const res = await fetch(`/api/items/${itemId}/intelligence`);
    if (!res.ok) throw new Error("Intelligence endpoint not available");
    const intel = await res.json();

    // Recovery probability bar
    const probBar = document.getElementById("detailProbabilityBar");
    const probLabel = document.getElementById("detailProbabilityLabel");
    if (probBar) {
      const pct = intel.recovery_probability_pct || 0;
      probBar.style.width = `${pct}%`;
      probBar.className = `h-2 rounded-full transition-all duration-700 ${pct >= 70 ? 'bg-emerald-500' : pct >= 40 ? 'bg-amber-500' : 'bg-rose-500'}`;
      if (probLabel) probLabel.textContent = `${pct}% Recovery Probability`;
    }

    // Smart next action
    if (nextActionMsg) {
      nextActionMsg.textContent = intel.smart_next_action || "Monitor for incoming matches.";
    }

    // High-value badge
    if (highValueBadge) {
      if (intel.is_high_value) {
        highValueBadge.classList.remove("hidden");
      } else {
        highValueBadge.classList.add("hidden");
      }
    }

    // Smart Recovery Timeline
    if (timelineContainer && intel.smart_timeline && intel.smart_timeline.length > 0) {
      renderSmartTimeline(intel.smart_timeline, timelineContainer);
    }

  } catch (err) {
    console.warn("Intelligence load error:", err);
    if (nextActionMsg) nextActionMsg.textContent = "Check the Smart Matches hub for active AI-detected candidates.";
    if (timelineContainer) {
      renderSmartTimeline([
        { stage: "Report Submitted", status: "done", description: "Item logged and vault-encrypted." },
        { stage: "AI Scan Active", status: "active", description: "Matching engine continuously comparing all campus reports." },
        { stage: "Ownership Verified", status: "pending", description: "Zero-leak challenge quiz awaiting claimant." },
        { stage: "Safe Handover Scheduled", status: "pending", description: "Dual-confirmation at Campus Security Office." },
        { stage: "Item Returned", status: "pending", description: "Reunion complete — Campus Impact Score updated." }
      ], timelineContainer);
    }
  }
}

function renderSmartTimeline(timeline, container) {
  if (!container) return;

  container.innerHTML = timeline.map((step, idx) => {
    const isDone = step.status === "done" || step.status === "completed";
    const isActive = step.status === "active" || step.status === "current" || step.status === "in_progress";
    const isPending = !isDone && !isActive;

    const dotColor = isDone ? "bg-emerald-500" :
                     isActive ? "bg-blue-500 animate-pulse" :
                     "bg-slate-700";
    const textColor = isDone ? "text-emerald-400" :
                      isActive ? "text-blue-300" :
                      "text-slate-500";
    const lineColor = idx < timeline.length - 1 ?
                      (isDone ? "border-emerald-700" : "border-slate-800") : "";

    return `
      <div class="relative flex gap-3">
        <div class="flex flex-col items-center">
          <div class="w-3 h-3 rounded-full ${dotColor} flex-shrink-0 mt-0.5 z-10 relative"></div>
          ${idx < timeline.length - 1 ? `<div class="w-px flex-1 mt-1 border-l ${lineColor || 'border-slate-800'} border-dashed"></div>` : ""}
        </div>
        <div class="pb-3 min-w-0 flex-1">
          <p class="text-xs font-semibold ${textColor}">${escapeHtml(step.stage || step.title || `Step ${idx + 1}`)}</p>
          <p class="text-[11px] text-slate-400 mt-0.5">${escapeHtml(step.description || step.detail || "")}</p>
          ${isActive ? `<span class="inline-block mt-1 px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-300 text-[10px] font-bold">ACTIVE NOW</span>` : ""}
        </div>
      </div>
    `;
  }).join("");
}

// ----------------- MATCH MOMENT MODAL (Top 5 Feature) -----------------

function openMatchMomentModal(matchData) {
  const modal = document.getElementById("matchMomentModal");
  const title = document.getElementById("matchMomentTitle");
  const scannerBox = document.getElementById("matchMomentScannerBox");
  const revealBox = document.getElementById("matchMomentRevealBox");
  const claimBtn = document.getElementById("matchMomentClaimBtn");

  if (!modal) return;

  if (title) title.textContent = "Recovery Intelligence Engine — Match Detected";
  if (revealBox) revealBox.classList.add("hidden");
  if (scannerBox) {
    scannerBox.innerHTML = `
      <div class="text-center space-y-4">
        <div class="relative w-16 h-16 mx-auto">
          <div class="w-16 h-16 rounded-full border-4 border-blue-500/30 animate-ping absolute inset-0"></div>
          <div class="w-16 h-16 rounded-full border-4 border-cyan-400/60 animate-spin flex items-center justify-center">
            <i data-lucide="cpu" class="w-6 h-6 text-cyan-300"></i>
          </div>
        </div>
        <p class="text-sm font-bold text-white animate-pulse">AI Cross-Referencing All Campus Data...</p>
        <div class="w-full bg-slate-800 rounded-full h-1.5">
          <div id="scanProgressBar" class="bg-gradient-to-r from-blue-500 to-cyan-400 h-1.5 rounded-full transition-all duration-200" style="width: 0%"></div>
        </div>
        <p class="text-xs text-slate-400">Analyzing 6 weighted similarity vectors</p>
      </div>
    `;
    initIcons();
  }

  modal.classList.remove("hidden");
  document.body.style.overflow = "hidden";

  // Animate scanner progress
  let progress = 0;
  const progressInterval = setInterval(() => {
    progress = Math.min(progress + Math.random() * 12, 95);
    const bar = document.getElementById("scanProgressBar");
    if (bar) bar.style.width = `${progress}%`;
  }, 150);

  // After 2.5s reveal the match result
  setTimeout(() => {
    clearInterval(progressInterval);
    const bar = document.getElementById("scanProgressBar");
    if (bar) bar.style.width = "100%";

    setTimeout(() => {
      if (scannerBox) {
        const score = matchData?.score || matchData?.match_score || 91;
        const itemName = matchData?.lost_item_name || matchData?.item_name || "Your Item";
        const foundZone = matchData?.found_zone || matchData?.campus_zone || "Campus Zone";

        scannerBox.innerHTML = `
          <div class="text-center space-y-2">
            <div class="w-12 h-12 rounded-full bg-emerald-500/20 border-2 border-emerald-400 flex items-center justify-center mx-auto">
              <i data-lucide="check-circle-2" class="w-6 h-6 text-emerald-400"></i>
            </div>
            <p class="text-emerald-400 text-xs font-bold uppercase tracking-wider">Match Confirmed</p>
            <p class="text-2xl font-extrabold text-white">${Math.round(score)}%</p>
            <p class="text-slate-300 text-xs">Confidence Score</p>
          </div>
        `;
        initIcons();
      }

      if (revealBox) {
        const score = matchData?.score || matchData?.match_score || 91;
        const itemName = matchData?.lost_item_name || matchData?.item_name || "Your Item";
        const foundZone = matchData?.found_zone || matchData?.campus_zone || "Campus Zone";
        const explanation = matchData?.explanation || `This item matches based on category, location proximity, color, and brand alignment. AI confidence: ${Math.round(score)}%.`;

        revealBox.querySelector("#matchMomentScore") && (revealBox.querySelector("#matchMomentScore").textContent = `${Math.round(score)}% Match`);
        revealBox.querySelector("#matchMomentItemName") && (revealBox.querySelector("#matchMomentItemName").textContent = itemName);
        revealBox.querySelector("#matchMomentExplanation") && (revealBox.querySelector("#matchMomentExplanation").textContent = explanation);
        revealBox.querySelector("#matchMomentZone") && (revealBox.querySelector("#matchMomentZone").textContent = foundZone);

        revealBox.classList.remove("hidden");
      }

      if (claimBtn && matchData?.found_item_id) {
        claimBtn.onclick = () => {
          closeMatchMomentModal();
          openClaimModal(matchData.found_item_id, matchData.lost_item_name || "Item");
        };
      }

      triggerConfetti();
    }, 300);
  }, 2500);
}

function closeMatchMomentModal() {
  const modal = document.getElementById("matchMomentModal");
  if (modal) modal.classList.add("hidden");
  document.body.style.overflow = "";
}

// ----------------- DUPLICATE CHECK (Top 5 Feature) -----------------

async function checkDuplicateSubmission() {
  const itemName = document.getElementById("repItemName")?.value?.trim() || "";
  const zone = document.getElementById("repZone")?.value?.trim() || "";
  const banner = document.getElementById("duplicateWarningBanner");
  const bannerMsg = document.getElementById("duplicateWarningMsg");

  if (!banner || itemName.length < 3) return;

  try {
    const res = await fetch("/api/items/check-duplicate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: currentUser.id,
        item_name: itemName,
        campus_zone: zone
      })
    });

    if (!res.ok) return;
    const data = await res.json();

    if (data.is_duplicate) {
      banner.classList.remove("hidden");
      if (bannerMsg) {
        bannerMsg.textContent = data.message || "Similar item previously reported in this zone.";
      }
    } else {
      banner.classList.add("hidden");
    }
  } catch (err) {
    // Silent fail — duplicate check is non-blocking
    if (banner) banner.classList.add("hidden");
  }
}

function dismissDuplicateWarning() {
  const banner = document.getElementById("duplicateWarningBanner");
  if (banner) banner.classList.add("hidden");
}

// ----------------- HIGH-VALUE FORM BADGE (Top 5 Feature) -----------------

function handleCategoryChange() {
  const cat = document.getElementById("repCategory")?.value || "";
  const badge = document.getElementById("highValueFormBadge");
  if (!badge) return;

  const highValueCategories = ["Electronics", "Wallet", "Laptop", "Phone", "Jewelry"];
  const isHigh = highValueCategories.some(hv => cat.toLowerCase().includes(hv.toLowerCase()));

  if (isHigh) {
    badge.classList.remove("hidden");
  } else {
    badge.classList.add("hidden");
  }
}

// ----------------- CAMPUS INTELLIGENCE LOADER (Top 5 Feature) -----------------

async function loadCampusIntelligence() {
  // Analytics are already rendered server-side as static data in index.html
  // This function refreshes dynamic data from the campus-intelligence endpoint
  try {
    const res = await fetch("/api/analytics/campus-intelligence");
    if (!res.ok) return;
    const data = await res.json();

    // Update impact score if element exists
    const impactEls = document.querySelectorAll("[data-campus-impact]");
    impactEls.forEach(el => {
      el.textContent = `${data.campus_impact_score || 78} / 100`;
    });

    // Update high-risk zone if elements exist
    if (data.high_risk_zones && data.high_risk_zones.length > 0) {
      const zone = data.high_risk_zones[0];
      const zoneEl = document.querySelector("[data-top-zone]");
      if (zoneEl) zoneEl.textContent = zone.zone;
    }

  } catch (err) {
    console.warn("Campus intelligence load error:", err);
  }
}

// ----------------- FEED ZONE FILTER (Intelligence Map) -----------------

function filterFeedByZone(zone) {
  const zoneFilter = document.getElementById("feedZoneFilter");
  if (zoneFilter) {
    zoneFilter.value = zone;
  }
  navigateTo("feed");
  showToast(`Filtering feed by: ${zone}`, "info");
}

// ----------------- UPDATED DEMO SEQUENCE (Top 5 Narrative) -----------------



function triggerConfetti() {
  if (window.confetti) {
    window.confetti({
      particleCount: 100,
      spread: 70,
      origin: { y: 0.6 }
    });
  }
}

function showToast(message, type = "info") {
  const container = document.getElementById("toastContainer");
  if (!container) return;

  const bg = type === "success" ? "bg-emerald-600 text-white" :
             type === "warning" ? "bg-amber-600 text-white" :
             type === "error" ? "bg-rose-600 text-white" : "bg-blue-600 text-white";

  const toast = document.createElement("div");
  toast.className = `px-4 py-3 rounded-2xl shadow-xl ${bg} text-xs font-semibold flex items-center gap-2 pointer-events-auto transition transform translate-y-2 opacity-0 duration-200`;
  toast.innerHTML = `<span>${escapeHtml(message)}</span>`;

  container.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.remove("translate-y-2", "opacity-0");
  });

  setTimeout(() => {
    toast.classList.add("translate-y-2", "opacity-0");
    setTimeout(() => toast.remove(), 200);
  }, 4000);
}

function timeAgo(dateStr) {
  if (!dateStr) return "recently";
  const d = new Date(dateStr.replace(" ", "T"));
  const diffSec = Math.floor((new Date() - d) / 1000);
  if (diffSec < 60) return "just now";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return `${Math.floor(diffSec / 86400)}d ago`;
}

function escapeHtml(str) {
  if (!str) return "";
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
