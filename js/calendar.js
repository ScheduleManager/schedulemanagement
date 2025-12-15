// js/calendar.js - LIGHT MODE ONLY

import { auth, provider, signInWithPopup, signOut, onAuthStateChanged, db, collection, query, orderBy, onSnapshot } from "./firebase-config.js";

let unsubscribeSnapshot = null;
window.tasks = [];
window.calendar = null;

// --- AUTH LOGIC ---
const btnLogin = document.getElementById('btnLogin');
const userProfile = document.getElementById('userProfile');
const userAvatar = document.getElementById('userAvatar');
const btnLogout = document.getElementById('btnLogout');

if (btnLogin) btnLogin.addEventListener('click', () => signInWithPopup(auth, provider).catch(e => showToast(e.message, true)));
if (btnLogout) btnLogout.addEventListener('click', () => signOut(auth));

onAuthStateChanged(auth, user => {
    if (unsubscribeSnapshot) {
        unsubscribeSnapshot();
        unsubscribeSnapshot = null;
        window.tasks = [];
        if (window.calendar) window.calendar.refetchEvents();
    }

    if (user) {
        btnLogin.classList.add('hidden');
        userProfile.classList.remove('hidden');
        userAvatar.src = user.photoURL;

        const q = query(collection(db, "users", user.uid, "tasks"), orderBy("deadline"));

        unsubscribeSnapshot = onSnapshot(q, (snapshot) => {
            window.tasks = snapshot.docs.map(doc => {
                const data = doc.data();
                const subtasks = Array.isArray(data.subtasks) ? data.subtasks : [];
                return { id: doc.id, ...data, subtasks };
            });

            const dynamicCats = new Set();
            window.tasks.forEach(t => {
                if (t.category && t.category.trim() !== '') dynamicCats.add(t.category);
            });

            if (window.updateFilterDropdown) window.updateFilterDropdown(dynamicCats);
            if (window.updateModalDropdown) window.updateModalDropdown(dynamicCats);
            if (window.calendar) window.calendar.refetchEvents();
        });
    } else {
        btnLogin.classList.remove('hidden');
        userProfile.classList.add('hidden');
    }
});

// --- UI LOGIC ---

function sendEmailReminder(task, userEmail) {
    if (!userEmail) return showToast("Không tìm thấy email người nhận", true);
    if (!window.emailjs) return showToast("Lỗi: Thư viện EmailJS chưa tải xong.", true);

    const templateParams = {
        to_email: userEmail,
        to_name: "Bạn",
        task_name: task.name,
        deadline: task.deadline,
        priority: task.priority,
        note: task.note || "Không có ghi chú"
    };

    window.emailjs.send('service_7gonw9k', 'template_6s0c89e', templateParams)
        .then(function (response) {
            showToast('📧 Đã TỰ ĐỘNG gửi email nhắc nhở (Việc gấp)!');
        }, function (error) {
            console.error('Email Failed...', error);
            const subject = encodeURIComponent(`[NHẮC NHỞ] Việc gấp: ${task.name}`);
            const body = encodeURIComponent(`Công việc: ${task.name}\nHạn chót: ${task.deadline}\nGhi chú: ${task.note}`);
            window.open(`https://mail.google.com/mail/?view=cm&fs=1&su=${subject}&body=${body}`, '_blank');
            showToast('⚠️ Mở Gmail thủ công do lỗi gửi tự động', true);
        });
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

document.addEventListener('DOMContentLoaded', function () {
    initCalendar();
    setupSearch();
    setupSidebar();
});

window.updateFilterDropdown = function (categories) {
    const filterSelect = document.getElementById('categoryFilterDesktop');
    const currentVal = filterSelect.value;
    while (filterSelect.options.length > 1) filterSelect.remove(1);
    const sortedCats = Array.from(categories).sort((a, b) => a.localeCompare(b));
    sortedCats.forEach(cat => filterSelect.add(new Option(cat, cat)));
    if (Array.from(filterSelect.options).some(o => o.value === currentVal)) filterSelect.value = currentVal;
}

window.updateModalDropdown = function (categories) {
    const modalSelect = document.getElementById('taskCategory');
    if (modalSelect.value === '__other__') return;
    const currentVal = modalSelect.value;
    modalSelect.innerHTML = '';
    const sortedCats = Array.from(categories).sort((a, b) => a.localeCompare(b));
    sortedCats.forEach(cat => modalSelect.add(new Option(cat, cat)));
    const otherOpt = new Option('+ Nhập danh mục mới...', '__other__');
    otherOpt.className = "fw-bold text-primary";
    modalSelect.add(otherOpt);

    if (Array.from(modalSelect.options).some(o => o.value === currentVal)) modalSelect.value = currentVal;
}

function initCalendar() {
    const calendarEl = document.getElementById('calendar');
    window.calendar = new FullCalendar.Calendar(calendarEl, {
        initialView: 'dayGridMonth',
        locale: 'vi',
        headerToolbar: { left: 'prev,next today', center: 'title', right: 'dayGridMonth,timeGridWeek,timeGridDay' },
        buttonText: { today: 'Hôm nay', month: 'Tháng', week: 'Tuần', day: 'Ngày' },
        height: 'auto',
        dayMaxEvents: false,
        slotMinTime: '06:00:00', slotMaxTime: '22:00:00', allDaySlot: true,

        events: function (info, successCallback) {
            const filterCat = document.getElementById('categoryFilterDesktop').value;
            const searchTerm = document.getElementById('searchInput').value.toLowerCase();
            const allTasks = window.tasks || [];
            let filtered = allTasks.filter(t => {
                const matchCat = filterCat === 'all' || t.category === filterCat;
                const matchSearch = t.name && t.name.toLowerCase().includes(searchTerm);
                return matchCat && matchSearch;
            });

            successCallback(filtered.map(t => {
                const displayDate = t.deadline || t.createdDate;
                let startISO = displayDate;
                let endISO = null;
                let isAllDay = true;

                if (t.startTime) {
                    startISO = `${displayDate}T${t.startTime}`;
                    isAllDay = false;
                    if (t.endTime) endISO = `${displayDate}T${t.endTime}`;
                }

                return {
                    id: t.id,
                    title: t.name,
                    start: startISO,
                    end: endISO,
                    allDay: isAllDay,
                    backgroundColor: 'transparent',
                    borderColor: 'transparent',
                    extendedProps: { ...t }
                }
            }));
        },

        eventContent: function (arg) {
            const props = arg.event.extendedProps;
            const bgColor = getCategoryColor(props.category);
            let iconHtml = '';
            if (props.status === 'Hoàn thành') iconHtml = '<i class="bi bi-check-square-fill text-green-300 mr-1.5 text-sm"></i>';
            else if (props.status === 'Chưa thực hiện') iconHtml = '<i class="bi bi-circle mr-1.5 text-[10px] opacity-70"></i>';
            else iconHtml = '<i class="bi bi-hourglass-split text-yellow-200 mr-1.5 text-xs"></i>';
            let timeDisplay = '';
            if (!arg.event.allDay && props.startTime) {
                timeDisplay = `<div class="event-time-badge">${props.startTime}${props.endTime ? ' - ' + props.endTime : ''}</div>`;
            }
            const today = new Date().setHours(0, 0, 0, 0);
            const deadline = new Date(props.deadline || props.createdDate).setHours(0, 0, 0, 0);
            let warningBadge = '';
            if (props.status !== 'Hoàn thành' && deadline === today) {
                warningBadge = '<span class="ml-auto bg-red-500 text-white text-[10px] font-bold px-1.5 rounded animate-pulse"><i class="bi bi-alarm-fill"></i></span>';
            }
            return {
                html: `<div class="custom-event" style="background-color: ${bgColor}; border-left: 3px solid rgba(0,0,0,0.2);">
                        ${timeDisplay}
                        <div class="event-title-row"><div class="event-icon">${iconHtml}</div><div class="event-title flex-1">${arg.event.title}</div>${warningBadge}</div>
                       </div>`
            };
        },
        dateClick: function (info) { openModal(null, info.dateStr); },
        eventClick: function (info) {
            const id = info.event.id;
            const task = (window.tasks || []).find(t => t.id === id);
            if (task) openModal(task);
        },
        eventDrop: function (info) {
            const id = info.event.id;
            const newStart = info.event.start.toISOString().split('T')[0];
            const task = (window.tasks || []).find(t => t.id === id);

            if (task && window.dbActions) {
                const updates = { deadline: newStart };
                let newStartTime = null;
                let newEndTime = null;
                if (!info.event.allDay && info.event.start) {
                    newStartTime = info.event.start.toTimeString().substring(0, 5);
                    if (info.event.end) newEndTime = info.event.end.toTimeString().substring(0, 5);
                    updates.startTime = newStartTime;
                    updates.endTime = newEndTime;
                }

                updates.createdDate = newStart;
                updates.emailSent24h = false;
                updates.emailSent4h = false;

                window.dbActions.update(id, updates);
                showToast("Đã cập nhật ngày hạn chót");
            }
        }
    });
    window.calendar.render();
}

function addDays(dateStr, days) {
    if (!dateStr) return '';
    const result = new Date(dateStr);
    result.setDate(result.getDate() + parseInt(days));
    return result.toISOString().split('T')[0];
}

function subtractDays(dateStr, days) {
    if (!dateStr) return '';
    const result = new Date(dateStr);
    result.setDate(result.getDate() - parseInt(days));
    return result.toISOString().split('T')[0];
}

window.calculateDeadline = function () {
    const start = document.getElementById('taskStartDate').value;
    const dur = document.getElementById('taskDuration').value || 0;
    if (start) document.getElementById('taskDeadline').value = addDays(start, dur);
}

window.calculateHours = function () {
    const start = document.getElementById('taskStartTime').value;
    const end = document.getElementById('taskEndTime').value;
    const output = document.getElementById('hourDurationText');
    if (start && end) {
        const s = new Date("1970-01-01 " + start);
        const e = new Date("1970-01-01 " + end);
        let diffMs = e - s;
        if (diffMs < 0) {
            output.innerText = "Giờ kết thúc phải sau giờ bắt đầu"; output.classList.add('text-red-500'); return;
        }
        output.classList.remove('text-red-500');
        const diffHrs = Math.floor((diffMs % 86400000) / 3600000);
        const diffMins = Math.round(((diffMs % 86400000) % 3600000) / 60000);
        let durationStr = "";
        if (diffHrs > 0) durationStr += `${diffHrs} tiếng `;
        if (diffMins > 0) durationStr += `${diffMins} phút`;
        if (diffHrs === 0 && diffMins === 0) durationStr = "0 phút";
        output.innerText = `Thời lượng: ${durationStr}`;
    } else {
        output.innerText = "";
    }
}

window.toggleCustomCategory = function (select) {
    const input = document.getElementById('customCategoryInput');
    if (select.value === '__other__') {
        input.classList.remove('hidden'); input.focus();
    } else {
        input.classList.add('hidden');
    }
}

window.openModal = function (task = null, dateStr = null) {
    const modal = document.getElementById('taskModal');
    const form = document.getElementById('taskForm');
    const title = document.getElementById('modalTitle');
    const deleteBtn = document.getElementById('deleteBtn');
    const saveBtn = document.getElementById('saveBtn');
    const customInput = document.getElementById('customCategoryInput');
    const formElements = form.querySelectorAll('input, select, textarea');
    form.reset();
    customInput.classList.add('hidden');
    document.getElementById('hourDurationText').innerText = "";

    const dynamicCats = new Set();
    if (window.tasks) window.tasks.forEach(t => { if (t.category && t.category.trim() !== '') dynamicCats.add(t.category); });
    updateModalDropdown(dynamicCats);

    const catSelect = document.getElementById('taskCategory');
    if (dynamicCats.size === 0 && catSelect.options.length > 0) {
        catSelect.value = '__other__';
        toggleCustomCategory(catSelect);
    }

    if (task) {
        const isCompleted = task.status === 'Hoàn thành';
        title.innerText = isCompleted ? 'Chi tiết công việc (Đã hoàn thành)' : 'Cập nhật công việc';
        document.getElementById('taskId').value = task.id;
        document.getElementById('taskName').value = task.name;

        if ([...catSelect.options].some(o => o.value === task.category)) {
            catSelect.value = task.category;
        } else {
            catSelect.value = '__other__'; customInput.value = task.category;
            if (!isCompleted) customInput.classList.remove('hidden');
        }

        document.getElementById('taskStatus').value = task.status;
        document.getElementById('taskStartDate').value = task.createdDate || '';
        document.getElementById('taskDuration').value = task.duration || 1;
        document.getElementById('taskDeadline').value = task.deadline || '';
        document.getElementById('taskStartTime').value = task.startTime || '';
        document.getElementById('taskEndTime').value = task.endTime || '';
        calculateHours();
        document.getElementById('taskNote').value = task.note || '';
        if (isCompleted) {
            formElements.forEach(el => el.disabled = true);
            saveBtn.classList.add('hidden'); deleteBtn.classList.remove('hidden');
        } else {
            formElements.forEach(el => { if (el.id !== 'taskDeadline') el.disabled = false; });
            saveBtn.classList.remove('hidden'); deleteBtn.classList.remove('hidden');
        }
    } else {
        title.innerText = 'Thêm công việc mới';
        document.getElementById('taskId').value = '';
        formElements.forEach(el => { if (el.id !== 'taskDeadline') el.disabled = false; });
        saveBtn.classList.remove('hidden');
        const defaultDuration = 1;
        let startDate, deadlineDate;
        let startTime = '';
        if (dateStr) {
            if (dateStr.includes('T')) {
                const parts = dateStr.split('T'); deadlineDate = parts[0]; startDate = subtractDays(deadlineDate, defaultDuration); startTime = parts[1].substring(0, 5);
            } else {
                deadlineDate = dateStr;
                startDate = dateStr;
                const now = new Date(); startTime = (now.getHours() + 1).toString().padStart(2, '0') + ":00";
            }
        } else {
            startDate = new Date().toISOString().split('T')[0]; deadlineDate = addDays(startDate, defaultDuration);
            const now = new Date(); startTime = (now.getHours() + 1).toString().padStart(2, '0') + ":00";
        }
        document.getElementById('taskStartDate').value = startDate;
        document.getElementById('taskDuration').value = defaultDuration;
        document.getElementById('taskDeadline').value = deadlineDate;
        document.getElementById('taskStartTime').value = startTime;
        if (startTime) {
            const [h, m] = startTime.split(':').map(Number);
            const endH = (h + 1) % 24;
            document.getElementById('taskEndTime').value = endH.toString().padStart(2, '0') + ":" + m.toString().padStart(2, '0');
        }
        calculateHours();

        if (catSelect.options.length > 1) {
            catSelect.selectedIndex = 0;
        } else {
            catSelect.value = '__other__';
            toggleCustomCategory(catSelect);
        }

        document.getElementById('taskStatus').value = 'Đang thực hiện';
        deleteBtn.classList.add('hidden');
    }
    modal.classList.remove('hidden');
}

window.closeModal = function () { document.getElementById('taskModal').classList.add('hidden'); }

window.saveTask = async function (e) {
    e.preventDefault();
    const id = document.getElementById('taskId').value;
    const startDate = document.getElementById('taskStartDate').value;
    let duration = parseInt(document.getElementById('taskDuration').value) || 0;
    const status = document.getElementById('taskStatus').value;

    const deadline = addDays(startDate, duration);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const deadlineDate = new Date(deadline);
    deadlineDate.setHours(0, 0, 0, 0);

    const diffTime = deadlineDate - today;
    const daysLeft = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    let priority = 'Trung bình';
    if (status === 'Chưa thực hiện' || status === 'Hoàn thành') {
        priority = 'Thấp'; if (status === 'Hoàn thành') duration = 0;
    } else {
        if (daysLeft <= 3) priority = 'Cao'; else if (daysLeft >= 10) priority = 'Thấp';
    }

    let category = document.getElementById('taskCategory').value;
    if (category === '__other__') {
        category = document.getElementById('customCategoryInput').value.trim();
        if (!category) return alert("Vui lòng nhập tên danh mục mới");
    }

    const taskData = {
        name: document.getElementById('taskName').value,
        category: category,
        status: status,
        priority: priority,
        createdDate: startDate,
        duration: duration,
        deadline: deadline,
        startTime: document.getElementById('taskStartTime').value,
        endTime: document.getElementById('taskEndTime').value,
        note: document.getElementById('taskNote').value,
        emailSent24h: false,
        emailSent4h: false
    };

    if (!id) {
        taskData.subtasks = [];
    }

    try {
        if (window.dbActions) {
            if (id) {
                await window.dbActions.update(id, taskData);
                showToast("Đã cập nhật thành công!");
            } else {
                await window.dbActions.add(taskData);
                showToast("Đã thêm công việc mới!");
            }

            if (document.getElementById('taskCategory').value === '__other__') {
                document.getElementById('customCategoryInput').value = '';
                document.getElementById('customCategoryInput').classList.add('hidden');
            }
            closeModal();
        } else { alert("Chưa kết nối DB"); }
    } catch (err) { console.error(err); showToast("Lỗi: " + err.message, true); }
}

window.deleteTask = async function () {
    const id = document.getElementById('taskId').value;
    if (id && confirm('Bạn có chắc chắn muốn xóa?')) {
        try { await window.dbActions.delete(id); showToast("Đã xóa công việc!"); closeModal(); }
        catch (e) { showToast("Lỗi xóa: " + e.message, true); }
    }
}

function showToast(msg, isError = false) {
    const toast = document.getElementById('toast');
    document.getElementById('toastMsg').innerText = msg;
    if (isError) toast.querySelector('div').classList.replace('bg-green-500', 'bg-red-500');
    else toast.querySelector('div').classList.replace('bg-red-500', 'bg-green-500');
    toast.classList.remove('translate-y-24', 'opacity-0');
    setTimeout(() => toast.classList.add('translate-y-24', 'opacity-0'), 3000);
}

window.exportExcel = function () {
    const allTasks = window.tasks || [];
    if (allTasks.length === 0) return showToast("Không có dữ liệu để xuất", true);
    const ws = XLSX.utils.json_to_sheet(allTasks);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "CongViec");
    XLSX.writeFile(wb, "LichLamViec.xlsx");
}

function setupSearch() {
    document.getElementById('searchInput').addEventListener('input', () => { if (window.calendar) window.calendar.refetchEvents(); });
}

function setupSidebar() {
    const menuOpenBtn = document.getElementById('menuOpenButton');
    const menuCloseBtn = document.getElementById('menuCloseButton');
    const sidebar = document.getElementById('sidebar');
    const sidebarOverlay = document.getElementById('sidebarOverlay');
    if (menuOpenBtn) menuOpenBtn.addEventListener('click', () => { sidebar.classList.remove('-translate-x-full'); sidebarOverlay.classList.remove('hidden'); });
    const close = () => { sidebar.classList.add('-translate-x-full'); sidebarOverlay.classList.add('hidden'); };
    if (menuCloseBtn) menuCloseBtn.addEventListener('click', close);
    if (sidebarOverlay) sidebarOverlay.addEventListener('click', close);
}

window.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        document.body.classList.add('loaded');
    }, 50);
});

document.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', e => {
        const href = link.getAttribute('href');
        if (href && !href.startsWith('#') && !href.startsWith('mailto') && link.target !== '_blank') {
            e.preventDefault();
            if (document.startViewTransition) {
                document.startViewTransition(() => {
                    window.location.href = href;
                });
            } else {
                document.body.classList.remove('loaded');
                setTimeout(() => {
                    window.location.href = href;
                }, 400);
            }
        }
    });
});