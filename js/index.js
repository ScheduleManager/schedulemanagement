// js/index.js - FINAL FULL VERSION
import { auth, provider, signInWithPopup, signOut, onAuthStateChanged, db, collection, query, orderBy, onSnapshot } from "./firebase-config.js";

window.tasks = window.tasks || [];
let unsubscribeSnapshot = null;
let currentPage = 1;
const rowsPerPage = 10;
let filteredTasks = [];
let charts = {};
let tempSubtasks = [];
let currentDetailTaskId = null;

const BASE_COLORS = {
    cat: { 'Giảng dạy': '#0d6efd', 'Họp': '#fd7e14', 'Coi thi': '#dc3545', 'Việc cá nhân': '#6c757d' },
    status: { 'Hoàn thành': 'success', 'Đang thực hiện': 'primary', 'Chưa thực hiện': 'danger' },
    priority: { 'Cao': 'danger', 'Trung bình': 'warning', 'Thấp': 'success' }
};

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
                const deadline = new Date(data.deadline);
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                deadline.setHours(0, 0, 0, 0);
                const diffTime = deadline - today;
                const daysLeft = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

                let priority = 'Trung bình';
                if (data.status === 'Chưa thực hiện' || data.status === 'Hoàn thành') {
                    priority = 'Thấp';
                } else {
                    if (daysLeft <= 3) priority = 'Cao';
                    else if (daysLeft >= 10) priority = 'Thấp';
                }

                const subtasks = Array.isArray(data.subtasks) ? data.subtasks : [];
                return { id: doc.id, ...data, subtasks, daysLeft, priority };
            });

            window.tasks = loadedTasks;

            if (window.renderApp) window.renderApp();

            if (currentDetailTaskId) {
                const currentTask = window.tasks.find(t => t.id === currentDetailTaskId);
                if (currentTask) renderDetailChecklist(currentTask);
            }

        }, (error) => {
            console.error("Lỗi Firestore:", error);
        });

    } else {
        if (btnLogin) btnLogin.classList.remove('d-none');
        if (userProfile) userProfile.classList.add('d-none');
        if (mainContent) mainContent.classList.add('d-none');
        if (loginWarning) loginWarning.classList.remove('d-none');
    }
});

function removeVietnameseTones(str) {
    if (!str) return '';
    str = str.replace(/à|á|ạ|ả|ã|â|ầ|ấ|ậ|ẩ|ẫ|ă|ằ|ắ|ặ|ẳ|ẵ/g, "a").replace(/è|é|ẹ|ẻ|ẽ|ê|ề|ế|ệ|ể|ễ/g, "e").replace(/ì|í|ị|ỉ|ĩ/g, "i").replace(/ò|ó|ọ|ỏ|õ|ô|ồ|ố|ộ|ổ|ỗ|ơ|ờ|ớ|ợ|ở|ỡ/g, "o").replace(/ù|ú|ụ|ủ|ũ|ư|ừ|ứ|ự|ử|ữ/g, "u").replace(/ỳ|ý|ỵ|ỷ|ỹ/g, "y").replace(/đ/g, "d");
    str = str.replace(/À|Á|Ạ|Ả|Ã|Â|Ầ|Ấ|Ậ|Ẩ|Ẫ|Ă|Ằ|Ắ|Ặ|Ẳ|Ẵ/g, "A").replace(/È|É|Ẹ|Ẻ|Ẽ|Ê|Ề|Ế|Ệ|Ể|Ễ/g, "E").replace(/Ì|Í|Ị|Ỉ|Ĩ/g, "I").replace(/Ò|Ó|Ọ|Ỏ|Õ|Ô|Ồ|Ố|Ộ|Ổ|Ỗ|Ơ|Ờ|Ớ|Ợ|Ở|Ỡ/g, "O").replace(/Ù|Ú|Ụ|Ủ|Ũ|Ư|Ừ|Ứ|Ự|Ử|Ữ/g, "U").replace(/Ỳ|Ý|Ỵ|Ỷ|Ỹ/g, "Y").replace(/Đ/g, "D");
    return str.replace(/\u0300|\u0301|\u0303|\u0309|\u0323/g, "");
}

function getCategoryColor(catName) {
    if (BASE_COLORS.cat[catName]) return BASE_COLORS.cat[catName];
    let hash = 0;
    for (let i = 0; i < catName.length; i++) hash = catName.charCodeAt(i) + ((hash << 5) - hash);
    return `hsl(${Math.abs(hash % 360)}, ${60 + (Math.abs(hash) % 20)}%, ${40 + (Math.abs(hash) % 10)}%)`;
}

function getAllCategories() {
    const cats = new Set(['Giảng dạy', 'Họp', 'Coi thi', 'Việc cá nhân']);
    if (Array.isArray(window.tasks)) {
        window.tasks.forEach(t => { if (t.category && t.category.trim() !== '') cats.add(t.category); });
    }
    return Array.from(cats).sort((a, b) => a.localeCompare(b));
}

function addDays(dateStr, days) {
    const result = new Date(dateStr);
    result.setDate(result.getDate() + parseInt(days));
    return result.toISOString().split('T')[0];
}

function sendEmailReminder(task, userEmail) {
    if (!userEmail) return showToast("Không tìm thấy email người nhận", 'danger');
    const templateParams = { to_email: userEmail, to_name: "Bạn", task_name: task.name, deadline: task.deadline, priority: task.priority, note: task.note || "Không có ghi chú" };
    // 👇 THAY SERVICE ID VÀ TEMPLATE ID CỦA BẠN VÀO ĐÂY
    emailjs.send('service_7gonw9k', 'template_6s0c89e', templateParams)
        .then(function (response) {
            showToast('📧 Đã gửi email nhắc nhở thành công!', 'success');
        }, function (error) {
            console.error('FAILED...', error);
            const subject = encodeURIComponent(`[NHẮC NHỞ] Việc gấp: ${task.name}`);
            const body = encodeURIComponent(`Công việc: ${task.name}\nHạn chót: ${task.deadline}\nGhi chú: ${task.note}`);
            window.open(`https://mail.google.com/mail/?view=cm&fs=1&su=${subject}&body=${body}`, '_blank');
            showToast('⚠️ Chưa cấu hình EmailJS, mở Gmail thay thế', 'warning');
        });
}

window.renderApp = function () {
    const allCats = getAllCategories();
    updateFilterDropdown(allCats);
    applyFilters();
    updateCharts();
    updateNotifications();
    renderFocusTask();
    renderWeeklyTasks();
}

const searchInput = document.getElementById('searchInput');
const suggestionsBox = document.getElementById('searchSuggestions');

searchInput.addEventListener('input', function () { const query = this.value.toLowerCase(); applyFilters(); showSuggestions(query); });
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
        if (nameClean.includes(cleanQuery)) { matches.push({ type: 'task', text: t.name, icon: 'bi-check2-square' }); }
        if (catClean.includes(cleanQuery)) { if (!matches.some(m => m.type === 'cat' && m.text === t.category)) { matches.push({ type: 'cat', text: t.category, icon: 'bi-tag-fill' }); } }
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

function applyFilters() {
    const stFilter = document.getElementById('filterStatus').value;
    const catFilter = document.getElementById('filterCategory').value;
    const rawSearch = document.getElementById('searchInput').value;
    const search = removeVietnameseTones(rawSearch.trim().toLowerCase());
    const allTasks = window.tasks || [];

    filteredTasks = allTasks.filter(t => {
        const matchStatus = stFilter === 'all' || (stFilter === 'urgent' ? (t.priority === 'Cao' && t.status !== 'Hoàn thành') : t.status === stFilter);
        const matchCatFilter = catFilter === 'all' || t.category === catFilter;
        const fullContent = `${t.name} ${t.category} ${t.note || ''} ${t.status} ${t.priority}`;
        const normalizedContent = removeVietnameseTones(fullContent.toLowerCase());
        const matchSearch = normalizedContent.includes(search);
        return matchStatus && matchCatFilter && matchSearch;
    });

    const maxPage = Math.ceil(filteredTasks.length / rowsPerPage) || 1;
    if (currentPage > maxPage) currentPage = maxPage;
    renderTable();
    renderPagination();
}

function renderFocusTask() {
    const container = document.getElementById('focusTaskSection');
    const allTasks = window.tasks || [];
    let focusTask = allTasks.filter(t => t.status !== 'Hoàn thành').filter(t => t.daysLeft <= 0).sort((a, b) => { const priMap = { 'Cao': 3, 'Trung bình': 2, 'Thấp': 1 }; if (priMap[b.priority] !== priMap[a.priority]) return priMap[b.priority] - priMap[a.priority]; return a.daysLeft - b.daysLeft; })[0];
    if (!focusTask) { focusTask = allTasks.filter(t => t.status !== 'Hoàn thành').sort((a, b) => a.daysLeft - b.daysLeft)[0]; }

    if (!focusTask) {
        container.innerHTML = `<div class="card bg-success text-white p-3 rounded-4 shadow-sm h-100 d-flex align-items-center justify-content-center text-center"><div class="d-flex align-items-center gap-2"><i class="bi bi-check-circle-fill fs-4"></i><div><h6 class="fw-bold mb-0">Sạch bách!</h6><span class="small opacity-75">Hết việc rồi.</span></div></div></div>`;
        return;
    }

    const timeLabel = focusTask.daysLeft < 0 ? 'Quá hạn' : (focusTask.daysLeft === 0 ? 'Hôm nay' : 'Còn lại');
    const timeValue = focusTask.daysLeft < 0 ? `${Math.abs(focusTask.daysLeft)} ngày` : (focusTask.daysLeft === 0 ? 'Hạn chót' : `${focusTask.daysLeft} ngày`);
    const badgeColor = focusTask.priority === 'Cao' ? 'bg-danger' : 'bg-warning text-dark';

    container.innerHTML = `
        <div class="card card-focus p-3 w-100">
            <div class="card-focus-content h-100 d-flex flex-column justify-content-between">
                <div>
                    <div class="d-flex justify-content-between mb-1">
                        <div class="d-flex gap-1"><span class="badge bg-white bg-opacity-25 border border-white border-opacity-25" style="font-size: 0.7rem;">🔥 Tiêu điểm</span><span class="badge ${badgeColor} shadow-sm" style="font-size: 0.7rem;">${focusTask.priority}</span></div>
                    </div>
                    <h4 class="fw-bold mb-0 text-truncate" title="${focusTask.name}" style="font-size: 1.3rem;">${focusTask.name}</h4>
                    <small class="opacity-75 d-block text-truncate mb-2">${focusTask.category}</small>
                </div>
                <div class="d-flex align-items-end justify-content-between">
                    <div><div class="small text-uppercase opacity-75" style="font-size: 0.65rem;">${timeLabel}</div><div class="fs-5 fw-bold lh-1">${timeValue}</div></div>
                    <button class="btn btn-sm btn-light rounded-pill px-3 fw-bold text-primary shadow-sm" onclick="openTaskDetail('${focusTask.id}')">Chi tiết <i class="bi bi-arrow-right ms-3"></i></button>
                </div>
            </div>
        </div>`;
}

function renderWeeklyTasks() {
    const listGroup = document.getElementById('weeklyTaskBody');
    const noData = document.getElementById('noWeeklyTask');
    const allTasks = window.tasks || [];
    const curr = new Date();
    const first = curr.getDate() - curr.getDay() + 1;
    const last = first + 6;
    const monday = new Date(curr.setDate(first)); monday.setHours(0, 0, 0, 0);
    const sunday = new Date(curr.setDate(last)); sunday.setHours(23, 59, 59, 999);

    const weeklyTasks = allTasks.filter(t => {
        const d = new Date(t.deadline);
        return d >= monday && d <= sunday && t.status !== 'Hoàn thành';
    }).sort((a, b) => new Date(a.deadline) - new Date(b.deadline));

    if (weeklyTasks.length === 0) { listGroup.innerHTML = ''; noData.classList.remove('d-none'); return; }
    noData.classList.add('d-none'); listGroup.innerHTML = '';

    weeklyTasks.forEach(t => {
        const dateObj = new Date(t.deadline);
        const day = dateObj.toLocaleDateString('vi-VN', { weekday: 'short' });
        const dateNum = dateObj.getDate();
        listGroup.innerHTML += `
            <div class="list-group-item weekly-item d-flex align-items-center gap-3 cursor-pointer" onclick="openTaskDetail('${t.id}')">
                <div class="date-box flex-shrink-0"><span class="day">${day}</span><span class="date">${dateNum}</span></div>
                <div class="flex-grow-1 overflow-hidden"><div class="fw-bold text-dark text-truncate">${t.name}</div><div class="small text-muted text-truncate">${t.category}</div></div>
                <div class="flex-shrink-0"><i class="bi bi-chevron-right text-gray-300"></i></div>
            </div>`;
    });
}

function updateFilterDropdown(categories) { const filterSelect = document.getElementById('filterCategory'); const currentVal = filterSelect.value; while (filterSelect.options.length > 1) filterSelect.remove(1); categories.forEach(cat => filterSelect.add(new Option(cat, cat))); if (Array.from(filterSelect.options).some(o => o.value === currentVal)) filterSelect.value = currentVal; }
function updateModalDropdown(categories) { const modalSelect = document.getElementById('taskCategory'); const currentVal = modalSelect.value; modalSelect.innerHTML = ''; categories.forEach(cat => modalSelect.add(new Option(cat, cat))); const otherOpt = new Option('+ Nhập danh mục mới...', '__other__'); otherOpt.className = "fw-bold text-primary"; modalSelect.add(otherOpt); if (currentVal && currentVal !== '__other__' && categories.includes(currentVal)) modalSelect.value = currentVal; else if (currentVal === '__other__') modalSelect.value = '__other__'; }

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

        const tr = document.createElement('tr');
        tr.dataset.id = t.id;
        if (isCompleted) tr.classList.add('table-secondary', 'opacity-75');

        const getEditAttr = (field) => isCompleted ? '' : `onclick="editCell(this, '${field}')"`;
        const getCellClass = () => `editable-cell ${isCompleted ? 'locked' : ''}`;

        tr.innerHTML = `
            <td class="${getCellClass()} ps-4" ${getEditAttr('name')}><div class="fw-bold text-dark">${t.name}</div>${progressHtml}</td>
            <td class="${getCellClass()}" ${getEditAttr('category')}><span class="badge" style="background:${getCategoryColor(t.category)}">${t.category}</span></td>
            <td><span class="badge text-bg-${BASE_COLORS.priority[t.priority] || 'secondary'}">${t.priority}</span></td>
            <td class="text-muted small ${getCellClass()}" ${getEditAttr('createdDate')}>${t.createdDate || '-'}</td>
            <td class="text-center ${getCellClass()}" ${getEditAttr('duration')}>${t.duration} ngày</td>
            <td class="${getCellClass()}" ${getEditAttr('status')}><span class="badge text-bg-${BASE_COLORS.status[t.status] || 'secondary'}">${t.status}</span></td>
            <td class="text-muted fw-bold">${t.deadline}</td>
            <td>${daysBadge}</td>
            <td class="text-muted small fst-italic ${getCellClass()}" ${getEditAttr('note')}>${t.note || ''}</td>
            <td class="text-end pe-4">
                <button class="btn btn-outline-primary btn-sm rounded-circle me-1" onclick="openTaskDetail('${t.id}')" title="Xem & Sửa việc nhỏ"><i class="bi bi-eye"></i></button>
                <button class="btn btn-outline-danger btn-sm rounded-circle" onclick="confirmDelete('${t.id}')"><i class="bi bi-trash"></i></button>
            </td>
        `;
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
    if (field === 'status') { input = document.createElement('select'); input.className = 'form-select form-select-sm shadow-sm'; Object.keys(BASE_COLORS.status).forEach(opt => input.add(new Option(opt, opt, false, opt === oldVal))); }
    else if (field === 'category') { input = document.createElement('select'); input.className = 'form-select form-select-sm shadow-sm'; getAllCategories().forEach(opt => input.add(new Option(opt, opt, false, opt === oldVal))); }
    else if (field === 'createdDate') { input = document.createElement('input'); input.type = 'date'; input.className = 'form-control form-control-sm'; input.value = oldVal; }
    else if (field === 'duration') { input = document.createElement('input'); input.type = 'number'; input.className = 'form-control form-control-sm'; input.value = oldVal || 0; input.style.width = '70px'; input.onkeypress = (e) => e.charCode >= 48 && e.charCode <= 57; input.oninput = function () { this.value = Math.floor(this.value); }; }
    else { input = document.createElement('input'); input.type = 'text'; input.className = 'form-control form-control-sm'; input.value = oldVal || ''; }
    cell.innerHTML = ''; cell.appendChild(input); input.focus();
    const save = async () => { const newVal = input.value; if (newVal !== oldVal) { try { let processedVal = newVal; if (field === 'duration') processedVal = parseInt(newVal) || 0; const updates = { [field]: processedVal }; if (field === 'status' && processedVal === 'Hoàn thành') { updates.duration = 0; updates.priority = 'Thấp'; updates.deadline = task.createdDate; } else { if (field === 'duration') updates.deadline = addDays(task.createdDate, processedVal); if (field === 'createdDate') updates.deadline = addDays(processedVal, task.duration || 0); } await window.dbActions.update(taskId, updates); showToast('Đã cập nhật thành công!', 'success'); } catch (e) { showToast('Lỗi cập nhật: ' + e.message, 'danger'); cell.innerHTML = oldHtml; } } else { cell.innerHTML = oldHtml; } };
    input.onblur = save; input.onkeydown = (e) => { if (e.key === 'Enter') { input.blur(); } };
};

const addTaskModalEl = document.getElementById('addTaskModal'); const modalTitle = document.getElementById('modalTitle'); const saveBtn = document.getElementById('saveTaskBtn');
window.toggleCustomCategory = function (select) { const input = document.getElementById('customCategoryInput'); if (select.value === '__other__') { input.classList.remove('d-none'); input.focus(); } else { input.classList.add('d-none'); } }
window.addSubtaskFromInput = function () { const input = document.getElementById('subtaskInput'); const val = input.value.trim(); if (val) { tempSubtasks.push({ title: val, done: false }); input.value = ''; renderSubtasksInForm(); } }
window.removeSubtask = function (index) { tempSubtasks.splice(index, 1); renderSubtasksInForm(); }
function renderSubtasksInForm() { const list = document.getElementById('subtaskListPreview'); list.innerHTML = ''; tempSubtasks.forEach((sub, idx) => { list.innerHTML += `<li class="list-group-item d-flex justify-content-between align-items-center py-1 px-2"><span><i class="bi bi-circle me-2 text-muted"></i>${sub.title}</span><i class="bi bi-x text-danger cursor-pointer" onclick="removeSubtask(${idx})"></i></li>`; }); }
window.openTaskModal = function (taskId = null) { document.getElementById('addTaskForm').reset(); document.getElementById('customCategoryInput').classList.add('d-none'); updateModalDropdown(getAllCategories()); tempSubtasks = []; renderSubtasksInForm(); document.getElementById('editTaskId').value = ''; document.getElementById('taskStartDate').value = new Date().toISOString().split('T')[0]; const select = document.getElementById('taskCategory'); if (select.options.length > 0) select.selectedIndex = 0; modalTitle.innerText = "Thêm Công Việc Mới"; saveBtn.innerText = "Thêm Công Việc"; bootstrap.Modal.getOrCreateInstance(addTaskModalEl).show(); }

// --- HÀM SUBMIT (ĐÃ SỬA LOGIC PRIORITY VÀ EMAIL) ---
window.handleTaskSubmit = async () => {
    const taskId = document.getElementById('editTaskId').value; const startDate = document.getElementById('taskStartDate').value; let duration = parseInt(document.getElementById('taskDuration').value) || 0; let status = document.getElementById('taskStatus').value; const deadline = addDays(startDate, duration);

    // TÍNH PRIORITY CHUẨN XÁC
    let priority = 'Trung bình';
    if (status === 'Hoàn thành') { duration = 0; priority = 'Thấp'; }
    else { const today = new Date(); today.setHours(0, 0, 0, 0); const d = new Date(deadline); d.setHours(0, 0, 0, 0); const diffTime = d - today; const daysLeft = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); if (daysLeft <= 3) priority = 'Cao'; else if (daysLeft >= 10) priority = 'Thấp'; }

    let category = document.getElementById('taskCategory').value; if (category === '__other__') { category = document.getElementById('customCategoryInput').value.trim(); if (!category) return alert("Vui lòng nhập tên danh mục mới"); } const isSendEmail = document.getElementById('sendEmailCheck').checked; const taskData = { name: document.getElementById('taskName').value, category: category, priority: priority, status: status, duration: duration, createdDate: startDate, deadline: deadline, note: document.getElementById('taskNote').value, subtasks: tempSubtasks }; if (!taskData.name) return alert("Vui lòng nhập tên công việc"); try { if (window.dbActions) { if (taskId) { await window.dbActions.update(taskId, taskData); showToast('Đã cập nhật công việc!', 'success'); } else { await window.dbActions.add(taskData); showToast('Đã thêm công việc mới!', 'success'); if (isSendEmail) { const user = auth.currentUser; if (user && user.email) sendEmailReminder(taskData, user.email); } } if (document.getElementById('taskCategory').value === '__other__') { document.getElementById('taskCategory').value = getAllCategories()[0] || 'Giảng dạy'; document.getElementById('customCategoryInput').classList.add('d-none'); } const modal = bootstrap.Modal.getInstance(addTaskModalEl); if (modal) modal.hide(); } else { alert("Chưa kết nối được Database."); } } catch (e) { showToast('Lỗi: ' + e.message, 'danger'); }
};

const detailModalEl = document.getElementById('taskDetailModal'); detailModalEl.addEventListener('hidden.bs.modal', () => { currentDetailTaskId = null; });
window.openTaskDetail = function (taskId) { currentDetailTaskId = taskId; const task = (window.tasks || []).find(t => t.id === taskId); if (!task) return; document.getElementById('viewTaskName').innerText = task.name; const catBadge = document.getElementById('viewTaskCategory'); catBadge.innerText = task.category; catBadge.style.backgroundColor = getCategoryColor(task.category); const priBadge = document.getElementById('viewTaskPriority'); priBadge.innerText = `Ưu tiên: ${task.priority}`; priBadge.className = `badge rounded-pill text-bg-${BASE_COLORS.priority[task.priority] || 'secondary'}`; const statusBadge = document.getElementById('viewTaskStatus'); statusBadge.innerText = task.status; statusBadge.className = `badge rounded-pill text-bg-${BASE_COLORS.status[task.status] || 'secondary'}`; document.getElementById('viewTaskStartDate').innerText = task.createdDate; document.getElementById('viewTaskDeadline').innerText = task.deadline; document.getElementById('viewTaskNote').innerText = task.note || "Không có ghi chú."; renderDetailChecklist(task); bootstrap.Modal.getOrCreateInstance(detailModalEl).show(); }
function renderDetailChecklist(task) { const listEl = document.getElementById('viewSubtaskList'); const subs = task.subtasks || []; listEl.innerHTML = ''; if (subs.length === 0) { listEl.innerHTML = '<div class="p-3 text-center text-muted small fst-italic">Chưa có việc nhỏ nào.</div>'; return; } subs.forEach((s, idx) => { const isDone = s.done; listEl.innerHTML += `<div class="list-group-item list-group-item-action d-flex align-items-center justify-content-between p-2"><div class="d-flex align-items-center gap-2 flex-grow-1 cursor-pointer" onclick="toggleSubtask('${task.id}', ${idx})"><i class="bi ${isDone ? 'bi-check-circle-fill text-success' : 'bi-circle text-muted'} fs-5"></i><span class="${isDone ? 'text-decoration-line-through text-muted' : ''}">${s.title}</span></div><button class="btn btn-link text-danger p-0 ms-2" onclick="deleteSubtaskInDetail('${task.id}', ${idx})" title="Xóa việc này"><i class="bi bi-x-lg"></i></button></div>`; }); }
window.addSubtaskInDetail = async function () { if (!currentDetailTaskId) return; const input = document.getElementById('detailSubtaskInput'); const val = input.value.trim(); if (!val) return; const task = window.tasks.find(t => t.id === currentDetailTaskId); if (!task) return; const newSubs = task.subtasks ? [...task.subtasks] : []; newSubs.push({ title: val, done: false }); try { await window.dbActions.update(currentDetailTaskId, { subtasks: newSubs }); input.value = ''; input.focus(); } catch (e) { showToast("Lỗi thêm: " + e.message, 'danger'); } }
window.deleteSubtaskInDetail = async function (taskId, index) { if (confirm('Xóa việc nhỏ này?')) { const task = window.tasks.find(t => t.id === taskId); const newSubs = [...task.subtasks]; newSubs.splice(index, 1); try { await window.dbActions.update(taskId, { subtasks: newSubs }); } catch (e) { showToast("Lỗi xóa: " + e.message, 'danger'); } } }
window.toggleSubtask = async function (taskId, subIndex) { const task = window.tasks.find(t => t.id === taskId); if (!task) return; const newSubs = [...task.subtasks]; newSubs[subIndex].done = !newSubs[subIndex].done; try { await window.dbActions.update(taskId, { subtasks: newSubs }); } catch (e) { showToast("Lỗi cập nhật: " + e.message, 'danger'); } }
let deleteId = null; const delModal = new bootstrap.Modal(document.getElementById('deleteModal')); window.confirmDelete = (id) => { deleteId = id; delModal.show(); }; document.getElementById('confirmDeleteBtn').onclick = async () => { if (deleteId) { await window.dbActions.delete(deleteId); delModal.hide(); showToast('Đã xóa công việc', 'success'); } };
function updateCharts() { const allTasks = window.tasks || []; if (allTasks.length === 0 && typeof tasks === 'undefined') return; const total = allTasks.length; const completed = allTasks.filter(t => t.status === 'Hoàn thành').length; const inProgress = allTasks.filter(t => t.status === 'Đang thực hiện').length; const overdue = allTasks.filter(t => t.status === 'Chưa thực hiện').length; document.getElementById('totalTasks').innerText = total; document.getElementById('completedTasks').innerText = completed; document.getElementById('inProgressTasks').innerText = inProgress; document.getElementById('overdueTasks').innerText = overdue; const catCounts = {}; allTasks.forEach(t => catCounts[t.category] = (catCounts[t.category] || 0) + 1); if (charts.cat) { charts.cat.data.labels = Object.keys(catCounts); charts.cat.data.datasets[0].data = Object.values(catCounts); charts.cat.data.datasets[0].backgroundColor = Object.keys(catCounts).map(c => getCategoryColor(c)); charts.cat.update(); const legendDiv = document.getElementById('categoryLegend'); legendDiv.innerHTML = ''; Object.keys(catCounts).forEach(catName => { const color = getCategoryColor(catName); const count = catCounts[catName]; legendDiv.innerHTML += `<div class="chart-legend-item"><div class="legend-label"><span class="legend-dot" style="background-color: ${color};"></span><span class="fw-medium text-dark">${catName}</span></div><span class="legend-value">${count}</span></div>`; }); } if (charts.status) { charts.status.data.datasets[0].data = [completed, inProgress, overdue]; charts.status.data.datasets[0].backgroundColor = ['#198754', '#0d6efd', '#dc3545']; charts.status.update(); const legendDiv = document.getElementById('completionLegend'); legendDiv.innerHTML = ''; const statusData = [{ label: 'Hoàn thành', color: '#198754', count: completed }, { label: 'Đang thực hiện', color: '#0d6efd', count: inProgress }, { label: 'Chưa thực hiện', color: '#dc3545', count: overdue }]; statusData.forEach(item => { legendDiv.innerHTML += `<div class="chart-legend-item"><div class="legend-label"><span class="legend-dot" style="background-color: ${item.color};"></span><span class="fw-medium text-dark">${item.label}</span></div><span class="legend-value">${item.count}</span></div>`; }); } const dayCounts = { 'T2': 0, 'T3': 0, 'T4': 0, 'T5': 0, 'T6': 0, 'T7': 0, 'CN': 0 }; allTasks.forEach(t => { const day = new Date(t.deadline).getDay(); const map = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']; if (t.status !== 'Hoàn thành') dayCounts[map[day]]++; }); if (charts.work) { charts.work.data.datasets[0].data = Object.values(dayCounts); charts.work.update(); } }
function updateNotifications() { const urgent = (window.tasks || []).filter(t => t.priority === 'Cao' && t.status !== 'Hoàn thành').sort((a, b) => a.daysLeft - b.daysLeft); const badge = document.getElementById('notifyBadge'); const list = document.getElementById('notificationList'); badge.innerText = urgent.length; badge.style.display = urgent.length ? 'block' : 'none'; list.innerHTML = ''; if (urgent.length === 0) { list.innerHTML = '<li class="text-center p-3 text-muted">Không có việc gấp</li>'; } else { urgent.forEach(t => { const colorClass = t.daysLeft < 0 ? 'text-danger' : 'text-warning'; const timeText = t.daysLeft < 0 ? `Quá ${Math.abs(t.daysLeft)} ngày` : (t.daysLeft == 0 ? 'Hôm nay' : `Còn ${t.daysLeft} ngày`); list.innerHTML += `<div class="dropdown-item notification-item py-2 cursor-pointer" onclick="openTaskDetail('${t.id}')"><div class="fw-bold text-dark text-truncate">${t.name}</div><div class="d-flex justify-content-between small"><span class="badge bg-secondary bg-opacity-25 text-dark">${t.status}</span><span class="${colorClass} fw-bold">${timeText}</span></div></div>`; }); } }
function showToast(msg, type = 'primary') { const el = document.getElementById('liveToast'); document.getElementById('toastMsg').innerText = msg; el.className = `toast align-items-center text-bg-${type} border-0`; new bootstrap.Toast(el).show(); }
function renderPagination() { const pages = Math.ceil(filteredTasks.length / rowsPerPage) || 1; const ul = document.getElementById('paginationControls'); let html = ''; for (let i = 1; i <= pages; i++) { html += `<li class="page-item ${i === currentPage ? 'active' : ''}"><button class="page-link" onclick="currentPage=${i}; renderTable()">${i}</button></li>`; } ul.innerHTML = html; document.getElementById('paginationInfo').innerText = `Trang ${currentPage}/${pages} (${filteredTasks.length} việc)`; }
const themeBtn = document.getElementById('themeToggle'); const htmlEl = document.documentElement; const themeIcon = themeBtn ? themeBtn.querySelector('i') : null; function applyTheme(theme) { if (theme === 'dark') { htmlEl.setAttribute('data-bs-theme', 'dark'); htmlEl.classList.add('dark'); if (themeIcon) { themeIcon.className = 'bi bi-sun-fill'; if (themeBtn.classList.contains('btn-light')) { themeBtn.classList.replace('btn-light', 'btn-dark'); themeBtn.classList.replace('text-warning', 'text-warning'); } } } else { htmlEl.setAttribute('data-bs-theme', 'light'); htmlEl.classList.remove('dark'); if (themeIcon) { themeIcon.className = 'bi bi-moon-stars-fill'; if (themeBtn.classList.contains('btn-dark')) { themeBtn.classList.replace('btn-dark', 'btn-light'); } } } if (typeof Chart !== 'undefined' && window.charts) { const textColor = theme === 'dark' ? '#cbd5e1' : '#666'; const gridColor = theme === 'dark' ? '#334155' : '#e5e7eb'; Chart.defaults.color = textColor; Chart.defaults.borderColor = gridColor; Object.values(window.charts || {}).forEach(chart => { if (chart.options.scales) { ['x', 'y'].forEach(axis => { if (chart.options.scales[axis]) { chart.options.scales[axis].ticks.color = textColor; chart.options.scales[axis].grid.color = gridColor; } }); } chart.update(); }); } } const savedTheme = localStorage.getItem('theme') || 'light'; applyTheme(savedTheme); if (themeBtn) { themeBtn.addEventListener('click', () => { const currentTheme = htmlEl.getAttribute('data-bs-theme') === 'dark' ? 'dark' : 'light'; const newTheme = currentTheme === 'dark' ? 'light' : 'dark'; localStorage.setItem('theme', newTheme); applyTheme(newTheme); }); }
document.addEventListener('DOMContentLoaded', () => { Chart.defaults.font.family = "'Inter', sans-serif"; const commonOpt = { plugins: { legend: { display: false } }, cutout: '75%', responsive: true, maintainAspectRatio: false }; charts.cat = new Chart(document.getElementById('categoryChart'), { type: 'doughnut', data: { labels: [], datasets: [{ data: [], borderWidth: 0 }] }, options: commonOpt }); charts.status = new Chart(document.getElementById('completionChart'), { type: 'doughnut', data: { labels: ['Xong', 'Đang làm', 'Chưa làm'], datasets: [{ data: [], backgroundColor: ['#198754', '#0d6efd', '#dc3545'], borderWidth: 0 }] }, options: commonOpt }); charts.work = new Chart(document.getElementById('workloadChart'), { type: 'bar', data: { labels: ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'], datasets: [{ label: 'Việc', data: [], backgroundColor: '#0dcaf0', borderRadius: 4 }] }, options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { grid: { color: '#f0f0f0' } }, y: { grid: { display: false } } } } }); document.getElementById('searchInput').addEventListener('input', applyFilters); document.getElementById('filterStatus').addEventListener('change', applyFilters); document.getElementById('filterCategory').addEventListener('change', applyFilters); });