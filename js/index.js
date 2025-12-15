// js/index.js - LIGHT MODE ONLY

import { auth, provider, signInWithPopup, signOut, onAuthStateChanged, db, collection, query, orderBy, onSnapshot } from "./firebase-config.js";

// --- 1. BIẾN TOÀN CỤC & CẤU HÌNH ---
window.tasks = window.tasks || [];
let unsubscribeSnapshot = null;
let currentPage = 1;
const rowsPerPage = 10;
let filteredTasks = [];
let charts = {};
let tempSubtasks = [];
let currentDetailTaskId = null;

const BASE_COLORS_STATUS = { 'Hoàn thành': 'success', 'Đang thực hiện': 'primary', 'Chưa thực hiện': 'danger' };
const BASE_COLORS_PRIORITY = { 'Cao': 'danger', 'Trung bình': 'warning', 'Thấp': 'success' };

// --- 2. AUTHENTICATION & DATA SYNC ---
const btnLogin = document.getElementById('btnLogin');
const userProfile = document.getElementById('userProfile');
const mainContent = document.getElementById('mainContent');
const loginWarning = document.getElementById('loginWarning');

if (btnLogin) btnLogin.addEventListener('click', () => signInWithPopup(auth, provider).catch(e => showToast(e.message, 'danger')));
if (document.getElementById('btnLogout')) document.getElementById('btnLogout').addEventListener('click', () => signOut(auth));

onAuthStateChanged(auth, user => {
    if (unsubscribeSnapshot) {
        unsubscribeSnapshot();
        unsubscribeSnapshot = null;
        window.tasks = [];
        if (window.renderApp) window.renderApp();
    }
    if (user) {
        if (btnLogin) btnLogin.classList.add('d-none');
        if (userProfile) userProfile.classList.remove('d-none');
        if (document.getElementById('userAvatar')) document.getElementById('userAvatar').src = user.photoURL;
        if (mainContent) mainContent.classList.remove('d-none');
        if (loginWarning) loginWarning.classList.add('d-none');

        const q = query(collection(db, "users", user.uid, "tasks"), orderBy("deadline"));

        unsubscribeSnapshot = onSnapshot(q, (snapshot) => {
            const loadedTasks = snapshot.docs.map(doc => {
                const data = doc.data();

                const targetDateStr = data.deadline || data.createdDate;
                const targetDate = new Date(targetDateStr);
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                targetDate.setHours(0, 0, 0, 0);

                const diffTime = targetDate - today;
                const daysLeft = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

                let priority = data.priority || 'Trung bình';
                if (data.status === 'Chưa thực hiện' || data.status === 'Hoàn thành') { priority = 'Thấp'; }
                if (data.status !== 'Hoàn thành' && daysLeft <= 3 && daysLeft >= 0) { priority = 'Cao'; }

                const subtasks = Array.isArray(data.subtasks) ? data.subtasks : [];
                const startTime = data.startTime || "00:00";
                const endTime = data.endTime || "23:59";
                const duration = data.duration || 1;

                return { id: doc.id, ...data, subtasks, daysLeft, priority, startTime, endTime, duration, deadline: targetDateStr };
            });

            window.tasks = loadedTasks;
            if (window.renderApp) window.renderApp();

            if (currentDetailTaskId) {
                const currentTask = window.tasks.find(t => t.id === currentDetailTaskId);
                if (currentTask) renderDetailChecklist(currentTask);
            }

            checkAutoReminders(user.email);

        }, (error) => { console.error("Lỗi Firestore:", error); });
    } else {
        if (btnLogin) btnLogin.classList.remove('d-none');
        if (userProfile) userProfile.classList.add('d-none');
        if (mainContent) mainContent.classList.add('d-none');
        if (loginWarning) loginWarning.classList.remove('d-none');
    }
});

// --- 3. HELPER FUNCTIONS ---
function removeVietnameseTones(str) {
    if (!str) return '';
    str = str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');
    return str;
}

function getCategoryColor(catName) {
    const baseColors = {
        'Giảng dạy': '#0d6efd', 'Họp': '#fd7e14', 'Coi thi': '#dc3545', 'Việc cá nhân': '#64748b'
    };
    if (baseColors[catName]) return baseColors[catName];
    let hash = 0;
    for (let i = 0; i < catName.length; i++) hash = catName.charCodeAt(i) + ((hash << 5) - hash);
    return `hsl(${Math.abs(hash % 360)}, ${60 + (Math.abs(hash) % 20)}%, ${40 + (Math.abs(hash) % 10)}%)`;
}

function getAllCategories() {
    const cats = new Set();
    if (Array.isArray(window.tasks)) {
        window.tasks.forEach(t => { if (t.category && t.category.trim() !== '') cats.add(t.category); });
    }
    return Array.from(cats).sort((a, b) => a.localeCompare(b));
}

function addDays(dateStr, days) {
    if (!dateStr) return new Date().toISOString().split('T')[0];
    const result = new Date(dateStr);
    result.setDate(result.getDate() + parseInt(days));
    return result.toISOString().split('T')[0];
}

// --- 4. EMAIL & REMINDERS ---
function checkAutoReminders(userEmail) {
    if (!window.tasks || window.tasks.length === 0) return;
    const now = new Date();

    window.tasks.forEach(task => {
        if (task.status === 'Hoàn thành') return;

        const deadlineStr = task.deadline || task.createdDate;
        if (!deadlineStr) return;

        const timeStr = task.endTime || '23:59';
        const deadlineDate = new Date(`${deadlineStr}T${timeStr}:00`);

        const diffMs = deadlineDate - now;
        const diffHours = diffMs / (1000 * 60 * 60);

        if (diffHours <= 24 && diffHours > 4) {
            if (!task.emailSent24h) {
                console.log(`[Auto Mail Dashboard] 24h: ${task.name}`);
                sendEmailReminder(task, userEmail, "NHẮC HẸN (Còn 1 ngày)");
                if (window.dbActions) window.dbActions.update(task.id, { emailSent24h: true });
            }
        }
        else if (diffHours <= 4 && diffHours > 0) {
            if (!task.emailSent4h) {
                console.log(`[Auto Mail Dashboard] 4h: ${task.name}`);
                sendEmailReminder(task, userEmail, "BÁO ĐỘNG (Sắp hết hạn 4h)");
                if (window.dbActions) window.dbActions.update(task.id, { emailSent4h: true });
            }
        }
    });
}

function sendEmailReminder(task, userEmail, titlePrefix = "NHẮC NHỞ") {
    if (!userEmail || !window.emailjs) return;
    const templateParams = {
        to_email: userEmail,
        to_name: "Bạn",
        task_name: `[${titlePrefix}] ${task.name}`,
        deadline: `${task.deadline} (${task.startTime} - ${task.endTime})`,
        priority: task.priority,
        note: task.note || "Hệ thống tự động gửi nhắc nhở."
    };
    window.emailjs.send('service_7gonw9k', 'template_6s0c89e', templateParams)
        .then(() => showToast(`📧 Đã gửi mail: ${titlePrefix}`, 'success'),
            (err) => console.error('Email Failed', err));
}

window.sendEmailManual = function (taskId) {
    const task = window.tasks.find(t => t.id === taskId);
    if (!task) return;
    const user = auth.currentUser;
    if (!user || !user.email) return showToast("Cần đăng nhập để gửi mail", 'danger');

    showToast("⏳ Đang gửi email...", 'warning');
    sendEmailReminder(task, user.email, "GỬI THỦ CÔNG");
}

// --- 5. RENDER & UI LOGIC ---
window.renderApp = function () {
    const allCats = getAllCategories();
    updateFilterDropdown(allCats);
    applyFilters();
    updateCharts();
    updateNotifications();
    renderFocusTask();
    renderDailyTasks();
}

// SEARCH
const searchInput = document.getElementById('searchInput');
const suggestionsBox = document.getElementById('searchSuggestions');
searchInput.addEventListener('input', function () { applyFilters(); showSuggestions(this.value.toLowerCase()); });
searchInput.addEventListener('focus', function () { if (this.value.trim() !== '') showSuggestions(this.value.toLowerCase()); });
document.addEventListener('click', function (e) { if (!searchInput.contains(e.target) && !suggestionsBox.contains(e.target)) { suggestionsBox.style.display = 'none'; } });

function showSuggestions(queryText) {
    if (!queryText) { suggestionsBox.style.display = 'none'; return; }
    const cleanQuery = removeVietnameseTones(queryText);
    const allTasks = window.tasks || [];
    let matches = [];
    allTasks.forEach(t => {
        const nameClean = removeVietnameseTones(t.name.toLowerCase());
        const catClean = removeVietnameseTones(t.category.toLowerCase());
        if (nameClean.includes(cleanQuery)) matches.push({ type: 'task', text: t.name, icon: 'bi-check2-square' });
        if (catClean.includes(cleanQuery) && !matches.some(m => m.type === 'cat' && m.text === t.category)) matches.push({ type: 'cat', text: t.category, icon: 'bi-tag-fill' });
    });
    matches = matches.slice(0, 5);
    if (matches.length > 0) {
        suggestionsBox.innerHTML = '';
        matches.forEach(m => {
            const div = document.createElement('div'); div.className = 'suggestion-item'; div.innerHTML = `<i class="bi ${m.icon} suggestion-icon"></i> ${m.text}`;
            div.onclick = () => { searchInput.value = m.text; suggestionsBox.style.display = 'none'; applyFilters(); };
            suggestionsBox.appendChild(div);
        });
        suggestionsBox.style.display = 'block';
    } else { suggestionsBox.style.display = 'none'; }
}

// FILTER
function applyFilters() {
    const stFilter = document.getElementById('filterStatus').value;
    const catFilter = document.getElementById('filterCategory').value;
    const timeFilter = document.getElementById('filterTime').value;
    const rawSearch = document.getElementById('searchInput').value;
    const search = removeVietnameseTones(rawSearch.trim().toLowerCase());

    filteredTasks = (window.tasks || []).filter(t => {
        const matchStatus = stFilter === 'all' || (stFilter === 'urgent' ? (t.priority === 'Cao' && t.status !== 'Hoàn thành') : t.status === stFilter);
        const matchCat = catFilter === 'all' || t.category === catFilter;
        const fullContent = `${t.name} ${t.category} ${t.note || ''}`;
        const matchSearch = removeVietnameseTones(fullContent.toLowerCase()).includes(search);

        let matchTime = true;
        if (timeFilter !== 'all') {
            const range = parseInt(timeFilter);
            matchTime = t.daysLeft >= 0 && t.daysLeft <= range;
        }
        return matchStatus && matchCat && matchSearch && matchTime;
    });

    filteredTasks.sort((a, b) => {
        if (a.deadline !== b.deadline) return new Date(a.deadline) - new Date(b.deadline);
        return a.startTime.localeCompare(b.startTime);
    });

    const maxPage = Math.ceil(filteredTasks.length / rowsPerPage) || 1;
    if (currentPage > maxPage) currentPage = maxPage;
    renderTable();
    renderPagination();
}

// WIDGET: FOCUS TASK
function renderFocusTask() {
    const container = document.getElementById('focusTaskSection');
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const currentHM = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');

    let dailyTasks = (window.tasks || [])
        .filter(t => (t.deadline === todayStr || t.createdDate === todayStr) && t.status !== 'Hoàn thành')
        .sort((a, b) => a.startTime.localeCompare(b.startTime));

    let focusTask = dailyTasks.find(t => t.endTime >= currentHM);

    if (!focusTask) {
        container.innerHTML = `<div class="card bg-success text-white p-3 rounded-4 shadow-sm h-100 d-flex align-items-center justify-content-center text-center"><div class="d-flex align-items-center gap-2"><i class="bi bi-check-circle-fill fs-4"></i><div><h6 class="fw-bold mb-0">Hết việc hôm nay!</h6><span class="small opacity-75">Thảnh thơi nhé.</span></div></div></div>`;
        return;
    }

    const badgeColor = focusTask.priority === 'Cao' ? 'bg-danger' : 'bg-warning text-dark';
    let timeStatus = focusTask.startTime <= currentHM ? "Đang diễn ra" : "Sắp diễn ra";

    container.innerHTML = `
    <div class="card card-focus p-3 w-100">
        <div class="card-focus-content h-100 d-flex flex-column justify-content-between">
            <div>
                <div class="d-flex justify-content-between mb-1">
                    <div class="d-flex gap-1">
                        <span class="badge bg-white bg-opacity-25 border border-white border-opacity-25" style="font-size: 0.7rem;">🔥 Tiêu điểm</span>
                        <span class="badge ${badgeColor} shadow-sm" style="font-size: 0.7rem;">${focusTask.priority}</span>
                    </div>
                </div>
                <h4 class="fw-bold mb-0 text-truncate" title="${focusTask.name}" style="font-size: 1.3rem;">${focusTask.name}</h4>
                <small class="opacity-75 d-block text-truncate mb-2">${focusTask.category}</small>
            </div>
            <div class="d-flex align-items-end justify-content-between">
                <div>
                    <div class="small text-uppercase opacity-75" style="font-size: 0.65rem;">${timeStatus}</div>
                    <div class="fs-4 fw-bold lh-1">${focusTask.startTime} - ${focusTask.endTime}</div>
                </div>
                <button class="btn btn-sm btn-light rounded-pill px-3 fw-bold text-primary shadow-sm" onclick="openTaskDetail('${focusTask.id}')">Chi tiết <i class="bi bi-arrow-right ms-1"></i></button>
            </div>
        </div>
    </div>`;
}

// WIDGET: DAILY LIST
function renderDailyTasks() {
    const listGroup = document.getElementById('dailyTaskBody');
    const noData = document.getElementById('noDailyTask');
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const currentHM = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');

    const days = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
    document.getElementById('currentDateName').innerText = days[now.getDay()];
    document.getElementById('currentDateValue').innerText = `${now.getDate()} thg ${now.getMonth() + 1}`;

    const allTodayTasks = (window.tasks || []).filter(t => t.deadline === todayStr || t.createdDate === todayStr);

    const remainingTasks = allTodayTasks.filter(t => t.status !== 'Hoàn thành').length;
    document.getElementById('dailyRemainingCount').innerText = remainingTasks;

    const nextTask = allTodayTasks
        .filter(t => t.status !== 'Hoàn thành' && t.startTime > currentHM)
        .sort((a, b) => a.startTime.localeCompare(b.startTime))[0];

    const nextTaskInfoEl = document.getElementById('nextTaskInfo');
    if (remainingTasks === 0) {
        nextTaskInfoEl.innerText = "Tuyệt vời! Đã xong hết việc.";
        nextTaskInfoEl.className = "small fw-bold text-truncate text-success flex-grow-1";
    } else if (nextTask) {
        nextTaskInfoEl.innerText = `Sắp tới: ${nextTask.name} (${nextTask.startTime})`;
        nextTaskInfoEl.className = "small fw-bold text-truncate text-primary flex-grow-1";
    } else {
        const currentTask = allTodayTasks.find(t => t.status !== 'Hoàn thành' && t.startTime <= currentHM && t.endTime >= currentHM);
        if (currentTask) {
            nextTaskInfoEl.innerText = `Đang diễn ra: ${currentTask.name}`;
            nextTaskInfoEl.className = "small fw-bold text-truncate text-danger flex-grow-1";
        } else {
            nextTaskInfoEl.innerText = "Không có việc sắp tới.";
            nextTaskInfoEl.className = "small fw-bold text-truncate text-muted flex-grow-1";
        }
    }

    const visibleTasks = allTodayTasks
        .filter(t => t.status !== 'Hoàn thành' && t.endTime >= currentHM)
        .sort((a, b) => a.startTime.localeCompare(b.startTime));

    if (visibleTasks.length === 0) {
        listGroup.innerHTML = '';
        noData.classList.remove('d-none');
        return;
    }

    noData.classList.add('d-none');
    listGroup.innerHTML = '';

    visibleTasks.forEach(t => {
        let statusIcon = t.startTime <= currentHM ? '<i class="bi bi-play-circle-fill text-primary"></i>' : '<i class="bi bi-clock"></i>';
        listGroup.innerHTML += `
        <div class="list-group-item weekly-item d-flex align-items-center gap-3 cursor-pointer py-2" onclick="openTaskDetail('${t.id}')">
            <div class="date-box flex-shrink-0" style="width: 50px;">
                <span class="day text-primary" style="font-size: 0.7rem;">${t.startTime}</span>
                <span class="date text-muted" style="font-size: 0.7rem;">${t.endTime}</span>
            </div>
            <div class="flex-grow-1 overflow-hidden">
                <div class="fw-bold text-dark text-truncate" style="font-size: 0.95rem;">${t.name}</div>
                <div class="small text-muted text-truncate" style="font-size: 0.75rem;">${t.category}</div>
            </div>
            <div class="flex-shrink-0 text-muted">${statusIcon}</div>
        </div>`;
    });
}

function updateFilterDropdown(categories) {
    const filterSelect = document.getElementById('filterCategory');
    const currentVal = filterSelect.value;
    while (filterSelect.options.length > 1) filterSelect.remove(1);
    categories.forEach(cat => filterSelect.add(new Option(cat, cat)));
    if (Array.from(filterSelect.options).some(o => o.value === currentVal)) filterSelect.value = currentVal;
}
function updateModalDropdown(categories) {
    const modalSelect = document.getElementById('taskCategory');
    const currentVal = modalSelect.value;
    modalSelect.innerHTML = '';
    categories.forEach(cat => modalSelect.add(new Option(cat, cat)));
    const otherOpt = new Option('+ Nhập danh mục mới...', '__other__');
    otherOpt.className = "fw-bold text-primary";
    modalSelect.add(otherOpt);

    if (currentVal && currentVal !== '__other__' && categories.includes(currentVal)) modalSelect.value = currentVal;
    else if (currentVal === '__other__') modalSelect.value = '__other__';
}

function renderTable() {
    const tbody = document.getElementById('taskTableBody');
    tbody.innerHTML = '';
    const start = (currentPage - 1) * rowsPerPage;
    const pageData = filteredTasks.slice(start, start + rowsPerPage);
    if (!window.tasks || window.tasks.length === 0) { tbody.innerHTML = `<tr><td colspan="10" class="text-center py-5 text-muted">Dữ liệu trống. Hãy bấm "Thêm Việc" để bắt đầu.</td></tr>`; return; }
    if (pageData.length === 0) { tbody.innerHTML = `<tr><td colspan="10" class="text-center py-5 text-muted">Không tìm thấy kết quả phù hợp</td></tr>`; return; }

    pageData.forEach(t => {
        let daysBadge = '';
        const isCompleted = t.status === 'Hoàn thành';
        if (t.status === 'Chưa thực hiện') daysBadge = '';
        else if (isCompleted) daysBadge = `<span class="badge rounded-pill text-bg-success">Đã xong</span>`;
        else if (t.daysLeft < 0) daysBadge = `<span class="badge rounded-pill text-bg-danger">Quá ${Math.abs(t.daysLeft)} ngày</span>`;
        else if (t.daysLeft === 0) daysBadge = `<span class="badge rounded-pill text-bg-warning text-dark">Hạn chót hôm nay</span>`;
        else daysBadge = `<span class="fw-bold text-success">Còn ${t.daysLeft} ngày</span>`;

        const totalSub = t.subtasks ? t.subtasks.length : 0;
        const doneSub = t.subtasks ? t.subtasks.filter(s => s.done).length : 0;
        let progressHtml = '';
        if (totalSub > 0) {
            const percent = Math.round((doneSub / totalSub) * 100);
            progressHtml = `<div class="d-flex align-items-center gap-2 mt-1" style="width: 120px"><div class="progress flex-grow-1" style="height: 4px;"><div class="progress-bar bg-info" style="width: ${percent}%"></div></div><span class="small text-muted" style="font-size: 0.7rem;">${doneSub}/${totalSub}</span></div>`;
        }

        const tr = document.createElement('tr'); tr.dataset.id = t.id; if (isCompleted) tr.classList.add('table-secondary', 'opacity-75');
        const getEditAttr = (field) => isCompleted ? '' : `onclick="editCell(this, '${field}')"`;
        const getCellClass = () => `editable-cell ${isCompleted ? 'locked' : ''}`;
        const catColor = getCategoryColor(t.category);

        tr.innerHTML = `
        <td class="${getCellClass()} ps-4" ${getEditAttr('name')}><div class="fw-bold text-dark">${t.name}</div>${progressHtml}</td>
        <td class="${getCellClass()}" ${getEditAttr('category')}><span class="badge" style="background:${catColor}">${t.category}</span></td>
        <td class="text-muted fw-bold small ${getCellClass()}" ${getEditAttr('timeRange')}>${t.startTime} - ${t.endTime}</td>
        <td class="text-muted small ${getCellClass()}" ${getEditAttr('createdDate')}>${t.createdDate}</td>
        <td class="${getCellClass()}" ${getEditAttr('status')}><span class="badge text-bg-${BASE_COLORS_STATUS[t.status] || 'secondary'}">${t.status}</span></td>
        <td class="text-muted fw-bold">${t.deadline || t.createdDate}</td>
        <td>${daysBadge}</td>
        <td class="text-muted small fst-italic ${getCellClass()}" ${getEditAttr('note')}>${t.note || ''}</td>
        <td class="text-end pe-4"><button class="btn btn-outline-primary btn-sm rounded-circle me-1" onclick="openTaskDetail('${t.id}')" title="Xem & Sửa việc nhỏ"><i class="bi bi-eye"></i></button><button class="btn btn-outline-danger btn-sm rounded-circle" onclick="confirmDelete('${t.id}')"><i class="bi bi-trash"></i></button></td>`;
        tbody.appendChild(tr);
    });
}

window.editCell = function (cell, field) {
    if (cell.classList.contains('locked') || cell.querySelector('input, select')) return;
    const row = cell.closest('tr');
    const taskId = row.dataset.id;
    const task = (window.tasks || []).find(t => t.id === taskId);
    if (!task) return;
    const oldVal = task[field];
    const oldHtml = cell.innerHTML;
    let input;

    if (field === 'timeRange') {
        const wrapper = document.createElement('div');
        wrapper.className = 'd-flex align-items-center gap-1';

        const inputStart = document.createElement('input');
        inputStart.type = 'time';
        inputStart.className = 'form-control form-control-sm px-1 py-0';
        inputStart.style.fontSize = '0.8rem';
        inputStart.value = task.startTime;

        const sep = document.createElement('span');
        sep.innerText = '-';

        const inputEnd = document.createElement('input');
        inputEnd.type = 'time';
        inputEnd.className = 'form-control form-control-sm px-1 py-0';
        inputEnd.style.fontSize = '0.8rem';
        inputEnd.value = task.endTime;

        wrapper.appendChild(inputStart);
        wrapper.appendChild(sep);
        wrapper.appendChild(inputEnd);

        cell.innerHTML = '';
        cell.appendChild(wrapper);
        inputStart.focus();

        const saveTime = async () => {
            const newStart = inputStart.value;
            const newEnd = inputEnd.value;

            if (!newStart || !newEnd) return;
            if (newStart >= newEnd) {
                alert('Giờ kết thúc phải sau giờ bắt đầu');
                cell.innerHTML = oldHtml;
                return;
            }

            if (newStart !== task.startTime || newEnd !== task.endTime) {
                try {
                    await window.dbActions.update(taskId, { startTime: newStart, endTime: newEnd });
                    showToast('Đã cập nhật giờ!', 'success');
                } catch (e) {
                    showToast('Lỗi: ' + e.message, 'danger');
                    cell.innerHTML = oldHtml;
                }
            } else {
                cell.innerHTML = oldHtml;
            }
        };

        const handleBlur = (e) => {
            setTimeout(() => {
                if (!wrapper.contains(document.activeElement)) {
                    saveTime();
                }
            }, 0);
        };

        inputStart.onblur = handleBlur;
        inputEnd.onblur = handleBlur;
        inputStart.onkeydown = (e) => { if (e.key === 'Enter') inputEnd.focus(); };
        inputEnd.onkeydown = (e) => { if (e.key === 'Enter') inputEnd.blur(); };
        return;
    }

    if (field === 'status') { input = document.createElement('select'); input.className = 'form-select form-select-sm shadow-sm'; Object.keys(BASE_COLORS_STATUS).forEach(opt => input.add(new Option(opt, opt, false, opt === oldVal))); }
    else if (field === 'category') { input = document.createElement('select'); input.className = 'form-select form-select-sm shadow-sm'; getAllCategories().forEach(opt => input.add(new Option(opt, opt, false, opt === oldVal))); }
    else if (field === 'createdDate') { input = document.createElement('input'); input.type = 'date'; input.className = 'form-control form-control-sm'; input.value = oldVal; }
    else { input = document.createElement('input'); input.type = 'text'; input.className = 'form-control form-control-sm'; input.value = oldVal || ''; }

    cell.innerHTML = ''; cell.appendChild(input); input.focus();

    const save = async () => {
        const newVal = input.value;
        if (newVal !== oldVal) {
            try {
                let processedVal = newVal;
                const updates = { [field]: processedVal };

                if (field === 'status' && processedVal === 'Hoàn thành') { updates.priority = 'Thấp'; }
                if (field === 'createdDate') {
                    updates.deadline = processedVal;
                    updates.emailSent24h = false;
                    updates.emailSent4h = false;
                }

                await window.dbActions.update(taskId, updates);
                showToast('Đã cập nhật thành công!', 'success');
            } catch (e) { showToast('Lỗi cập nhật: ' + e.message, 'danger'); cell.innerHTML = oldHtml; }
        } else { cell.innerHTML = oldHtml; }
    };
    input.onblur = save; input.onkeydown = (e) => { if (e.key === 'Enter') { input.blur(); } };
};

// ADD TASK FORM
const addTaskModalEl = document.getElementById('addTaskModal');
const modalTitle = document.getElementById('modalTitle');
const saveBtn = document.getElementById('saveTaskBtn');

window.toggleCustomCategory = function (select) { const input = document.getElementById('customCategoryInput'); if (select.value === '__other__') { input.classList.remove('d-none'); input.focus(); } else { input.classList.add('d-none'); } }
window.addSubtaskFromInput = function () { const input = document.getElementById('subtaskInput'); const val = input.value.trim(); if (val) { tempSubtasks.push({ title: val, done: false }); input.value = ''; renderSubtasksInForm(); } }
window.removeSubtask = function (index) { tempSubtasks.splice(index, 1); renderSubtasksInForm(); }
function renderSubtasksInForm() { const list = document.getElementById('subtaskListPreview'); list.innerHTML = ''; tempSubtasks.forEach((sub, idx) => { list.innerHTML += `<li class="list-group-item d-flex justify-content-between align-items-center py-1 px-2"><span><i class="bi bi-circle me-2 text-muted"></i>${sub.title}</span><i class="bi bi-x text-danger cursor-pointer" onclick="removeSubtask(${idx})"></i></li>`; }); }

window.openTaskModal = function (taskId = null) {
    document.getElementById('addTaskForm').reset();
    document.getElementById('customCategoryInput').classList.add('d-none');
    updateModalDropdown(getAllCategories());
    tempSubtasks = [];
    renderSubtasksInForm();
    document.getElementById('editTaskId').value = '';

    const now = new Date();
    document.getElementById('taskStartDate').value = now.toISOString().split('T')[0];
    const currentH = now.getHours().toString().padStart(2, '0');
    const currentM = now.getMinutes().toString().padStart(2, '0');
    document.getElementById('taskStartTime').value = `${currentH}:${currentM}`;
    const nextH = (now.getHours() + 1).toString().padStart(2, '0');
    document.getElementById('taskEndTime').value = `${nextH}:${currentM}`;

    const select = document.getElementById('taskCategory');
    if (select.options.length > 0) { select.selectedIndex = 0; toggleCustomCategory(select); }
    modalTitle.innerText = "Thêm Công Việc Mới";
    saveBtn.innerText = "Thêm Công Việc";
    bootstrap.Modal.getOrCreateInstance(addTaskModalEl).show();
}

window.handleTaskSubmit = async () => {
    const taskId = document.getElementById('editTaskId').value;
    const startDate = document.getElementById('taskStartDate').value;
    const startTime = document.getElementById('taskStartTime').value;
    const endTime = document.getElementById('taskEndTime').value;
    const status = document.getElementById('taskStatus').value;

    if (!startDate || !startTime || !endTime) return alert("Vui lòng chọn đầy đủ ngày và giờ");
    if (startTime >= endTime) return alert("Giờ kết thúc phải sau giờ bắt đầu");

    let priority = 'Trung bình';
    if (status === 'Hoàn thành') priority = 'Thấp';

    let category = document.getElementById('taskCategory').value;
    if (category === '__other__') {
        category = document.getElementById('customCategoryInput').value.trim();
        if (!category) return alert("Vui lòng nhập tên danh mục mới");
    }

    const taskData = {
        name: document.getElementById('taskName').value,
        category: category,
        priority: priority,
        status: status,
        createdDate: startDate,
        deadline: startDate,
        duration: 1,
        startTime: startTime,
        endTime: endTime,
        note: document.getElementById('taskNote').value,
        subtasks: tempSubtasks,
        emailSent24h: false,
        emailSent4h: false
    };

    if (!taskData.name) return alert("Vui lòng nhập tên công việc");

    try {
        if (window.dbActions) {
            await window.dbActions.add(taskData);
            showToast('Đã thêm công việc mới!', 'success');

            if (document.getElementById('taskCategory').value === '__other__') {
                document.getElementById('taskCategory').value = getAllCategories()[0] || 'Giảng dạy';
                document.getElementById('customCategoryInput').classList.add('d-none');
            }
            const modal = bootstrap.Modal.getInstance(addTaskModalEl);
            if (modal) modal.hide();
        } else {
            alert("Chưa kết nối được Database.");
        }
    } catch (e) {
        showToast('Lỗi: ' + e.message, 'danger');
    }
};

// DETAIL MODAL
const detailModalEl = document.getElementById('taskDetailModal'); detailModalEl.addEventListener('hidden.bs.modal', () => { currentDetailTaskId = null; });
window.openTaskDetail = function (taskId) {
    currentDetailTaskId = taskId;
    const task = (window.tasks || []).find(t => t.id === taskId);
    if (!task) return;

    document.getElementById('viewTaskName').innerText = task.name;
    const catBadge = document.getElementById('viewTaskCategory');
    catBadge.innerText = task.category;
    catBadge.style.backgroundColor = getCategoryColor(task.category);

    const priBadge = document.getElementById('viewTaskPriority'); priBadge.innerText = `Ưu tiên: ${task.priority}`; priBadge.className = `badge rounded-pill text-bg-${BASE_COLORS_PRIORITY[task.priority] || 'secondary'}`;
    const statusBadge = document.getElementById('viewTaskStatus'); statusBadge.innerText = task.status; statusBadge.className = `badge rounded-pill text-bg-${BASE_COLORS_STATUS[task.status] || 'secondary'}`;

    document.getElementById('viewTaskTimeRange').innerText = `${task.startTime} - ${task.endTime}`;
    document.getElementById('viewTaskDate').innerText = task.deadline || task.createdDate;
    document.getElementById('viewTaskNote').innerText = task.note || "Không có ghi chú.";

    const isCompleted = task.status === 'Hoàn thành';
    const inputEl = document.getElementById('detailSubtaskInput');
    const btnEl = inputEl.nextElementSibling;

    let emailBtn = document.getElementById('btnSendEmailManual');
    if (!emailBtn) {
        emailBtn = document.createElement('button');
        emailBtn.id = 'btnSendEmailManual';
        emailBtn.className = 'btn btn-sm btn-outline-warning ms-2';
        emailBtn.innerHTML = '<i class="bi bi-envelope-fill me-1"></i> Gửi Mail';
        document.querySelector('#taskDetailModal .modal-footer').prepend(emailBtn);
    }
    const newEmailBtn = emailBtn.cloneNode(true);
    emailBtn.parentNode.replaceChild(newEmailBtn, emailBtn);
    newEmailBtn.onclick = () => window.sendEmailManual(taskId);


    if (isCompleted) {
        inputEl.disabled = true;
        inputEl.placeholder = "Công việc đã hoàn thành (Chỉ xem)";
        btnEl.disabled = true;
    } else {
        inputEl.disabled = false;
        inputEl.placeholder = "Nhập việc cần làm...";
        btnEl.disabled = false;
    }

    renderDetailChecklist(task);
    bootstrap.Modal.getOrCreateInstance(detailModalEl).show();
}

setInterval(() => {
    if (window.tasks && window.tasks.length > 0) {
        renderFocusTask();
        renderDailyTasks();
    }
}, 60000);

window.addEventListener('DOMContentLoaded', () => { setTimeout(() => { document.body.classList.add('loaded'); }, 50); });
document.querySelectorAll('a').forEach(link => { link.addEventListener('click', e => { const href = link.getAttribute('href'); if (href && !href.startsWith('#') && !href.startsWith('mailto') && link.target !== '_blank') { e.preventDefault(); if (document.startViewTransition) { document.startViewTransition(() => { window.location.href = href; }); } else { document.body.classList.remove('loaded'); setTimeout(() => { window.location.href = href; }, 400); } } }); });

window.addSubtaskInDetail = async function () { if (!currentDetailTaskId) return; const input = document.getElementById('detailSubtaskInput'); const val = input.value.trim(); if (!val) return; const task = window.tasks.find(t => t.id === currentDetailTaskId); if (!task) return; const newSubs = task.subtasks ? [...task.subtasks] : []; newSubs.push({ title: val, done: false }); try { await window.dbActions.update(currentDetailTaskId, { subtasks: newSubs }); input.value = ''; input.focus(); } catch (e) { showToast("Lỗi thêm: " + e.message, 'danger'); } }
window.deleteSubtaskInDetail = async function (taskId, index) { if (confirm('Xóa việc nhỏ này?')) { const task = window.tasks.find(t => t.id === taskId); const newSubs = [...task.subtasks]; newSubs.splice(index, 1); try { await window.dbActions.update(taskId, { subtasks: newSubs }); } catch (e) { showToast("Lỗi xóa: " + e.message, 'danger'); } } }
window.toggleSubtask = async function (taskId, subIndex) { const task = window.tasks.find(t => t.id === taskId); if (!task) return; const newSubs = [...task.subtasks]; newSubs[subIndex].done = !newSubs[subIndex].done; try { await window.dbActions.update(taskId, { subtasks: newSubs }); } catch (e) { showToast("Lỗi cập nhật: " + e.message, 'danger'); } }
let deleteId = null; const delModal = new bootstrap.Modal(document.getElementById('deleteModal')); window.confirmDelete = (id) => { deleteId = id; delModal.show(); }; document.getElementById('confirmDeleteBtn').onclick = async () => { if (deleteId) { await window.dbActions.delete(deleteId); delModal.hide(); showToast('Đã xóa công việc', 'success'); } };
function renderDetailChecklist(task) { const list = document.getElementById('viewSubtaskList'); list.innerHTML = ''; if (!task.subtasks || task.subtasks.length === 0) { list.innerHTML = '<div class="p-3 text-center text-muted small fst-italic">Chưa có việc nhỏ nào</div>'; return; } task.subtasks.forEach((sub, idx) => { const isDone = sub.done ? 'checked' : ''; const textClass = sub.done ? 'text-decoration-line-through text-muted' : ''; const lock = task.status === 'Hoàn thành' ? 'disabled' : ''; list.innerHTML += `<div class="list-group-item d-flex align-items-center justify-content-between p-2"><div class="d-flex align-items-center gap-2"><input class="form-check-input mt-0 cursor-pointer" type="checkbox" ${isDone} ${lock} onchange="toggleSubtask('${task.id}', ${idx})"><span class="${textClass}">${sub.title}</span></div><button class="btn btn-sm text-danger ${lock ? 'd-none' : ''}" onclick="deleteSubtaskInDetail('${task.id}', ${idx})"><i class="bi bi-trash"></i></button></div>`; }); }

// [FIX] Cập nhật mặc định cho Chart (không cần Dark Mode Logic nữa)
document.addEventListener('DOMContentLoaded', () => {
    Chart.defaults.font.family = "'Inter', sans-serif";
    // Set màu xám đậm mặc định cho dễ nhìn trên nền trắng
    Chart.defaults.color = '#334155';
    Chart.defaults.borderColor = '#e2e8f0';

    const commonOpt = { plugins: { legend: { display: false } }, cutout: '75%', responsive: true, maintainAspectRatio: false };
    charts.cat = new Chart(document.getElementById('categoryChart'), { type: 'doughnut', data: { labels: [], datasets: [{ data: [], borderWidth: 0 }] }, options: commonOpt });
    charts.status = new Chart(document.getElementById('completionChart'), { type: 'doughnut', data: { labels: ['Xong', 'Đang làm', 'Chưa làm'], datasets: [{ data: [], backgroundColor: ['#198754', '#0d6efd', '#dc3545'], borderWidth: 0 }] }, options: commonOpt });

    charts.work = new Chart(document.getElementById('workloadChart'), {
        type: 'bar',
        data: { labels: ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'], datasets: [{ label: 'Việc', data: [], backgroundColor: '#0dcaf0', borderRadius: 4 }] },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: {
                    grid: { color: '#f1f5f9' },
                    ticks: { color: '#64748b' } // Màu chữ trục X
                },
                y: {
                    grid: { display: false },
                    ticks: { color: '#64748b' } // Màu chữ trục Y
                }
            }
        }
    });

    document.getElementById('searchInput').addEventListener('input', applyFilters);
    document.getElementById('filterStatus').addEventListener('change', applyFilters);
    document.getElementById('filterCategory').addEventListener('change', applyFilters);
    document.getElementById('filterTime').addEventListener('change', applyFilters);
});

// Update Chart Colors
function updateCharts() {
    const allTasks = window.tasks || [];
    if (allTasks.length === 0 && typeof tasks === 'undefined') return;

    const total = allTasks.length;
    const completed = allTasks.filter(t => t.status === 'Hoàn thành').length;
    const inProgress = allTasks.filter(t => t.status === 'Đang thực hiện').length;
    const overdue = allTasks.filter(t => t.status === 'Chưa thực hiện').length;

    document.getElementById('totalTasks').innerText = total;
    document.getElementById('completedTasks').innerText = completed;
    document.getElementById('inProgressTasks').innerText = inProgress;
    document.getElementById('overdueTasks').innerText = overdue;

    const catCounts = {};
    allTasks.forEach(t => catCounts[t.category] = (catCounts[t.category] || 0) + 1);

    if (charts.cat) {
        charts.cat.data.labels = Object.keys(catCounts);
        charts.cat.data.datasets[0].data = Object.values(catCounts);
        charts.cat.data.datasets[0].backgroundColor = Object.keys(catCounts).map(c => getCategoryColor(c));
        charts.cat.update();

        const legendDiv = document.getElementById('categoryLegend');
        legendDiv.innerHTML = '';
        Object.keys(catCounts).forEach(catName => {
            const color = getCategoryColor(catName);
            const count = catCounts[catName];
            // [FIX] Xóa class text-white/text-dark để dùng màu mặc định
            legendDiv.innerHTML += `<div class="chart-legend-item"><div class="legend-label"><span class="legend-dot" style="background-color: ${color};"></span><span class="fw-medium">${catName}</span></div><span class="legend-value">${count}</span></div>`;
        });
    }

    if (charts.status) {
        charts.status.data.datasets[0].data = [completed, inProgress, overdue];
        charts.status.data.datasets[0].backgroundColor = ['#198754', '#0d6efd', '#dc3545'];
        charts.status.update();

        const legendDiv = document.getElementById('completionLegend');
        legendDiv.innerHTML = '';
        const statusData = [{ label: 'Hoàn thành', color: '#198754', count: completed }, { label: 'Đang thực hiện', color: '#0d6efd', count: inProgress }, { label: 'Chưa thực hiện', color: '#dc3545', count: overdue }];
        statusData.forEach(item => {
            legendDiv.innerHTML += `<div class="chart-legend-item"><div class="legend-label"><span class="legend-dot" style="background-color: ${item.color};"></span><span class="fw-medium">${item.label}</span></div><span class="legend-value">${item.count}</span></div>`;
        });
    }

    const dayCounts = { 'T2': 0, 'T3': 0, 'T4': 0, 'T5': 0, 'T6': 0, 'T7': 0, 'CN': 0 };
    allTasks.forEach(t => { const day = new Date(t.createdDate).getDay(); const map = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']; if (t.status !== 'Hoàn thành') dayCounts[map[day]]++; });
    if (charts.work) { charts.work.data.datasets[0].data = Object.values(dayCounts); charts.work.update(); }
}

function updateNotifications() {
    const urgent = (window.tasks || []).filter(t => t.priority === 'Cao' && t.status !== 'Hoàn thành').sort((a, b) => a.daysLeft - b.daysLeft);
    const badge = document.getElementById('notifyBadge');
    const list = document.getElementById('notificationList');
    badge.innerText = urgent.length;
    badge.style.display = urgent.length ? 'block' : 'none';
    list.innerHTML = '';

    if (urgent.length === 0) { list.innerHTML = '<li class="text-center p-3 text-muted">Không có việc gấp</li>'; }
    else {
        urgent.forEach(t => {
            const colorClass = t.daysLeft < 0 ? 'text-danger' : 'text-warning';
            const timeText = t.daysLeft < 0 ? `Quá ${Math.abs(t.daysLeft)} ngày` : (t.daysLeft == 0 ? 'Hôm nay' : `Còn ${t.daysLeft} ngày`);
            // [FIX] Xóa class text-dark
            list.innerHTML += `<div class="dropdown-item notification-item py-2 cursor-pointer" onclick="openTaskDetail('${t.id}')"><div class="fw-bold text-truncate">${t.name}</div><div class="d-flex justify-content-between small"><span class="badge bg-secondary bg-opacity-25 text-dark">${t.status}</span><span class="${colorClass} fw-bold">${timeText}</span></div></div>`;
        });
    }
}

function showToast(msg, type = 'primary') { const el = document.getElementById('liveToast'); document.getElementById('toastMsg').innerText = msg; el.className = `toast align-items-center text-bg-${type} border-0`; new bootstrap.Toast(el).show(); }
function renderPagination() { const pages = Math.ceil(filteredTasks.length / rowsPerPage) || 1; const ul = document.getElementById('paginationControls'); ul.innerHTML = ''; for (let i = 1; i <= pages; i++) { const li = document.createElement('li'); li.className = `page-item ${i === currentPage ? 'active' : ''}`; const button = document.createElement('button'); button.className = 'page-link'; button.innerText = i; button.addEventListener('click', (e) => { e.preventDefault(); currentPage = i; renderTable(); renderPagination(); }); li.appendChild(button); ul.appendChild(li); } document.getElementById('paginationInfo').innerText = `Trang ${currentPage}/${pages} (${filteredTasks.length} việc)`; }