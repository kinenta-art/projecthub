// ════════════════════════════════════════════════════════════
//  ProjectHub Pro v6 — firebase.js
//  Firebase config + semua fungsi database
//  Edit file ini jika ada perubahan struktur data
// ════════════════════════════════════════════════════════════

import { initializeApp }         from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getDatabase, ref, set, get, push, update, remove, onValue, off, serverTimestamp }
                                  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

// ════════════════════════════════════════════════════════════
//  AVATAR COMPRESSION — resize ke max 80x80px thumbnail
//  Dipanggil sebelum simpan avatar ke Firebase
// ════════════════════════════════════════════════════════════
export function compressAvatar(dataUrl, maxSize = 80) {
  return new Promise((resolve) => {
    if (!dataUrl || !dataUrl.startsWith('data:image')) { resolve(dataUrl); return; }
    const img = new Image();
    img.onload = () => {
      let w = img.width, h = img.height;
      if (w > h) { if (w > maxSize) { h = Math.round(h * maxSize / w); w = maxSize; } }
      else        { if (h > maxSize) { w = Math.round(w * maxSize / h); h = maxSize; } }
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/jpeg', 0.80));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

// ── CONFIG ──────────────────────────────────────────────────
const firebaseConfig = {
  apiKey:            "AIzaSyAzJbcUM3ihOoqV7olM1QSEQS5o7-9zgrU",
  authDomain:        "studio-6873146912-b9451.firebaseapp.com",
  databaseURL:       "https://studio-6873146912-b9451-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId:         "studio-6873146912-b9451",
  storageBucket:     "studio-6873146912-b9451.firebasestorage.app",
  messagingSenderId: "1009080692416",
  appId:             "1:1009080692416:web:e502084cd47c48b9954725"
};

const app = initializeApp(firebaseConfig);
const db  = getDatabase(app);

// ── HELPERS ─────────────────────────────────────────────────
export const uid      = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
export const nowISO   = () => new Date().toISOString();
export const deepCopy = o => JSON.parse(JSON.stringify(o));

// Session (simpan di sessionStorage agar aman)
export const session = {
  set:   (user) => sessionStorage.setItem('phub_user', JSON.stringify(user)),
  get:   ()     => { try { return JSON.parse(sessionStorage.getItem('phub_user')); } catch { return null; } },
  clear: ()     => sessionStorage.removeItem('phub_user'),
  isAdmin:  ()  => session.get()?.role === 'asst_manager',
  isLeader: ()  => session.get()?.role === 'leader',
  isStaff:  ()  => session.get()?.role === 'staff',
};

// ════════════════════════════════════════════════════════════
//  AUTH
// ════════════════════════════════════════════════════════════

// Login: cari user berdasarkan nama + password
export async function login(userId, password) {
  const snap = await get(ref(db, `users/${userId}`));
  if (!snap.exists()) return { ok: false, msg: 'Pengguna tidak ditemukan' };
  const user = snap.val();
  if (user.password !== password) return { ok: false, msg: 'Password salah' };
  session.set({ ...user, id: userId });
  return { ok: true, user: { ...user, id: userId } };
}

// Ambil semua user untuk ditampilkan di login (urut hierarki)
export async function getAllUsersForLogin() {
  const snap = await get(ref(db, 'users'));
  if (!snap.exists()) return [];
  const users = [];
  snap.forEach(child => {
    const data = child.val();
    users.push({ ...data, id: child.key }); // id selalu dari Firebase key
  });

  // Ambil nama section untuk setiap user
  const secSnap = await get(ref(db, 'sections'));
  const secMap = {};
  if (secSnap.exists()) {
    secSnap.forEach(c => { secMap[c.key] = c.val(); });
  }
  users.forEach(u => {
    if (u.sectionId && secMap[u.sectionId]) {
      u.sectionName = secMap[u.sectionId].name || u.sectionId;
    }
  });

  // Urut: asst_manager (0) → leader (1) → staff (2)
  const roleOrder = { asst_manager: 0, leader: 1, staff: 2 };
  users.sort((a, b) => {
    const rA = roleOrder[a.role] ?? 99;
    const rB = roleOrder[b.role] ?? 99;
    if (rA !== rB) return rA - rB;
    const sA = a.sectionOrder ?? 99;
    const sB = b.sectionOrder ?? 99;
    if (sA !== sB) return sA - sB;
    return (a.name || '').localeCompare(b.name || '');
  });

  return users;
}

// ════════════════════════════════════════════════════════════
//  USERS
// ════════════════════════════════════════════════════════════

export async function getUser(userId) {
  const snap = await get(ref(db, `users/${userId}`));
  return snap.exists() ? { id: snap.key, ...snap.val() } : null;
}

export async function getAllUsers() {
  const snap = await get(ref(db, 'users'));
  if (!snap.exists()) return [];
  const users = [];
  snap.forEach(c => {
    const data = c.val();
    if (!data) return;
    users.push({ ...data, id: c.key }); // id dari Firebase key SELALU menang
  });
  return users;
}

export async function getUsersBySection(sectionId) {
  const all = await getAllUsers();
  return all.filter(u => u.sectionId === sectionId);
}

export async function getLeaders() {
  const all = await getAllUsers();
  return all.filter(u => u.role === 'leader');
}

export async function saveUser(userId, data) {
  const { id: _ignore, ...dataWithoutId } = data;
  await update(ref(db, `users/${userId}`), dataWithoutId);
}

export async function createUser(data) {
  const cleanName = (data.name || '').toLowerCase()
    .replace(/[^a-z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
  const rolePrefix = data.role === 'asst_manager' ? 'admin'
    : data.role === 'leader' ? 'leader' : 'staff';
  const id = `user_${rolePrefix}_${cleanName}_${Date.now().toString(36)}`;
  const { id: _ignore, ...dataWithoutId } = data;
  await set(ref(db, `users/${id}`), { ...dataWithoutId, createdAt: nowISO() });
  return id;
}

export async function deleteUser(userId) {
  await remove(ref(db, `users/${userId}`));
}

// ════════════════════════════════════════════════════════════
//  SECTIONS
// ════════════════════════════════════════════════════════════

export async function getAllSections() {
  const snap = await get(ref(db, 'sections'));
  if (!snap.exists()) return [];
  const secs = [];
  snap.forEach(c => {
    const data = c.val();
    if (!data) return;
    secs.push({ ...data, id: c.key }); // id dari Firebase key SELALU menang
  });
  return secs.sort((a, b) => (a.order || 99) - (b.order || 99));
}

export async function saveSection(sectionId, data) {
  const { id: _ignore, ...dataWithoutId } = data;
  await update(ref(db, `sections/${sectionId}`), dataWithoutId);
}

export async function createSection(data) {
  const cleanName = (data.name || '').toLowerCase()
    .replace(/[^a-z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
  const id = cleanName ? `sec_${cleanName}` : `sec_${Date.now()}`;
  const { id: _ignore, ...dataWithoutId } = data;
  await set(ref(db, `sections/${id}`), { ...dataWithoutId, createdAt: nowISO() });
  return id;
}

export async function deleteSection(sectionId) {
  await remove(ref(db, `sections/${sectionId}`));
}

// ════════════════════════════════════════════════════════════
//  PROJECTS
// ════════════════════════════════════════════════════════════

export async function getAllProjects() {
  const snap = await get(ref(db, 'projects'));
  if (!snap.exists()) return [];
  const projs = [];
  snap.forEach(c => {
    const data = c.val();
    if (!data) return; // skip null/corrupt entries
    projs.push({ ...data, id: c.key }); // id dari Firebase key SELALU menang
  });
  return projs;
}

export async function getProject(projectId) {
  const snap = await get(ref(db, `projects/${projectId}`));
  return snap.exists() ? { id: snap.key, ...snap.val() } : null;
}

// Ambil project yang visible ke user tertentu
export async function getProjectsForUser(userId) {
  const all = await getAllProjects();
  return all.filter(p => p.visibleTo && p.visibleTo[userId]);
}

// Ambil project milik section (orgOwner = leader section)
export async function getProjectsBySection(sectionId) {
  const all = await getAllProjects();
  return all.filter(p => p.sectionId === sectionId);
}

export async function createProject(data) {
  const id = uid();
  const user = session.get();
  const { id: _ignore, ...dataWithoutId } = data;
  const project = {
    ...dataWithoutId,
    actualOwner:  data.actualOwner || user.id,
    orgOwner:     data.orgOwner || (user.role === 'staff' ? user.leaderId : user.id),
    sectionId:    data.sectionId || user.sectionId || null,
    createdAt:    nowISO(),
    updatedAt:    nowISO(),
    status:       data.status || 'open',
    steps:        data.steps || [],
    visibleTo:    data.visibleTo || {},
    // Plan vs Actual — start/end = plan; actualStart default = plan start
    actualStart:  data.actualStart || data.start || null,
    actualEnd:    data.actualEnd || null,
  };
  await set(ref(db, `projects/${id}`), project);
  return id;
}

export async function updateProject(projectId, data) {
  const { id: _ignore, ...dataWithoutId } = data;
  await update(ref(db, `projects/${projectId}`), { ...dataWithoutId, updatedAt: nowISO() });
}

export async function deleteProject(projectId) {
  await remove(ref(db, `projects/${projectId}`));
  // Hapus juga contribution data
  await remove(ref(db, `projectContributions/${projectId}`));
}

// Update visibility project
export async function updateProjectVisibility(projectId, userId, role) {
  await update(ref(db, `projects/${projectId}/visibleTo`), { [userId]: role });
}

export async function removeProjectVisibility(projectId, userId) {
  await remove(ref(db, `projects/${projectId}/visibleTo/${userId}`));
}

// ════════════════════════════════════════════════════════════
//  STEPS
// ════════════════════════════════════════════════════════════

export async function getSteps(projectId) {
  const snap = await get(ref(db, `projects/${projectId}/steps`));
  if (!snap.exists()) return [];
  if (Array.isArray(snap.val())) return snap.val();
  const steps = [];
  snap.forEach(c => steps.push({ ...c.val(), id: c.key }));
  return steps;
}

export async function saveSteps(projectId, steps) {
  // Auto-isi actualStart/actualEnd per step
  const processed = (steps || []).map(s => {
    const st = { ...s };
    // actualStart default = plan start (start)
    if (!st.actualStart && st.start) st.actualStart = st.start;
    // actualEnd: terisi saat done, kosong saat belum
    if (st.done && !st.actualEnd) st.actualEnd = nowISO();
    if (!st.done) st.actualEnd = null;
    return st;
  });
  await update(ref(db, `projects/${projectId}`), {
    steps: processed,
    updatedAt: nowISO()
  });
  await recalcContributions(projectId, processed);
  // Auto-kelola status project (100% → waiting_validation, dst)
  await recomputeProjectStatus(projectId);
}

// Hitung dominasi PIC per project
async function recalcContributions(projectId, steps) {
  const contrib = {};
  (steps || []).forEach(s => {
    if (s.pic) contrib[s.pic] = (contrib[s.pic] || 0) + 1;
  });
  const total = steps?.length || 0;
  const dominant = Object.entries(contrib).sort((a, b) => b[1] - a[1])[0];
  await set(ref(db, `projectContributions/${projectId}`), {
    contributions: contrib,
    total,
    dominant:      dominant ? dominant[0] : null,
    dominantPct:   dominant && total ? Math.round(dominant[1] / total * 100) : 0,
    updatedAt:     nowISO()
  });
}

export async function getContributions(projectId) {
  const snap = await get(ref(db, `projectContributions/${projectId}`));
  return snap.exists() ? snap.val() : null;
}

// ════════════════════════════════════════════════════════════
//  COLLABORATION REQUESTS
// ════════════════════════════════════════════════════════════

export async function sendCollabRequest(data) {
  const id = uid();
  const { id: _ig, ...clean } = data;
  const req = {
    ...clean,
    status:    'pending',   // pending | accepted | declined | expired
    createdAt: nowISO(),
    expiresAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(), // 3 hari
    respondedAt: null,
    picId:     null,
    picName:   null,
  };
  // JANGAN simpan id di dalam object (mencegah override saat baca)
  await set(ref(db, `collabRequests/${id}`), req);
  // Notif ke leader tujuan
  await sendNotification(data.toLeaderId, {
    type:      'collab_request',
    reqId:     id,
    fromId:    data.fromLeaderId,
    projectId: data.projectId,
    message:   data.message || '',
    title:     'Permintaan Kolaborasi',
    body:      `${data.fromLeaderName} mengundang Anda berkolaborasi di project "${data.projectName}"`,
    read:      false,
  });
  // Notif ke semua admin (monitor kolaborasi antar section)
  const admins = await getAdmins();
  for (const a of admins) {
    await sendNotification(a.id, {
      type:      'collab_monitor',
      reqId:     id,
      title:     'Kolaborasi Baru',
      body:      `${data.fromLeaderName} → ${data.toLeaderName||'?'}: kolaborasi "${data.projectName}"`,
      read:      false,
    });
  }
  return id;
}

// Helper: ambil semua admin
export async function getAdmins() {
  const snap = await get(ref(db, 'users'));
  if (!snap.exists()) return [];
  const admins = [];
  snap.forEach(c => { const u = c.val(); if (u && u.role === 'asst_manager') admins.push({ ...u, id: c.key }); });
  return admins;
}

// Ambil SEMUA collab requests (untuk admin monitor + requestor log)
export async function getAllCollabRequests() {
  const snap = await get(ref(db, 'collabRequests'));
  if (!snap.exists()) return [];
  const reqs = [];
  snap.forEach(c => { const d = c.val(); if (d) reqs.push({ ...d, id: c.key }); });
  return reqs.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
}

// Collab requests yang dikirim oleh user (log requestor)
export async function getSentCollabRequests(userId) {
  const all = await getAllCollabRequests();
  return all.filter(r => r.fromLeaderId === userId);
}

export async function respondCollabRequest(reqId, accept, picId = null, picName = null) {
  const snap = await get(ref(db, `collabRequests/${reqId}`));
  if (!snap.exists()) return;
  const req = snap.val();
  await update(ref(db, `collabRequests/${reqId}`), {
    status:      accept ? 'accepted' : 'declined',
    respondedAt: nowISO(),
    picId:       picId || null,
    picName:     picName || null,
  });
  const admins = await getAdmins();
  if (accept && picId) {
    // Beri visibility: leader tujuan (monitor) + PIC yang dipilih (execute)
    await updateProjectVisibility(req.projectId, req.toLeaderId, 'monitor');
    await updateProjectVisibility(req.projectId, picId, 'collab_pic');
    // Notif ke leader pengirim — sertakan picId & picName supaya bisa masuk dropdown
    await sendNotification(req.fromLeaderId, {
      type:      'collab_accepted',
      reqId,
      projectId: req.projectId,
      picId,
      picName,
      title:     'Kolaborasi Diterima',
      body:      `${req.toLeaderName||'Leader'} menerima kolaborasi "${req.projectName}" — PIC: ${picName||'?'}`,
      read:      false,
    });
    for (const a of admins) {
      await sendNotification(a.id, { type:'collab_monitor', reqId, title:'Kolaborasi Diterima', body:`"${req.projectName}" diterima, PIC: ${picName||'?'}`, read:false });
    }
  } else if (!accept) {
    await sendNotification(req.fromLeaderId, {
      type:      'collab_declined',
      reqId,
      projectId: req.projectId,
      title:     'Kolaborasi Ditolak',
      body:      `${req.toLeaderName||'Leader'} menolak kolaborasi "${req.projectName}"`,
      read:      false,
    });
    for (const a of admins) {
      await sendNotification(a.id, { type:'collab_monitor', reqId, title:'Kolaborasi Ditolak', body:`"${req.projectName}" ditolak ${req.toLeaderName||''}`, read:false });
    }
  }
}

export async function getPendingCollabRequests(userId) {
  const snap = await get(ref(db, 'collabRequests'));
  if (!snap.exists()) return [];
  const reqs = [];
  snap.forEach(c => {
    const r = { ...c.val(), id: c.key };
    if (r.toLeaderId === userId && r.status === 'pending') reqs.push(r);
  });
  return reqs;
}

// Auto-expire collab requests lewat 3 hari
export async function checkExpiredRequests() {
  const snap = await get(ref(db, 'collabRequests'));
  if (!snap.exists()) return;
  const now = new Date();
  snap.forEach(async c => {
    const r = c.val();
    if (r.status === 'pending' && new Date(r.expiresAt) < now) {
      await update(ref(db, `collabRequests/${c.key}`), { status: 'expired' });
      // Auto accept setelah expired
      if (r.toLeaderId) {
        await updateProjectVisibility(r.projectId, r.toLeaderId, 'execute');
        await sendNotification(r.toLeaderId, {
          type:  'collab_expired',
          title: 'Kolaborasi Auto-Diterima',
          body:  `Request kolaborasi "${r.projectName}" otomatis diterima karena tidak ada respons dalam 3 hari`,
          read:  false,
        });
      }
    }
  });
}

// ════════════════════════════════════════════════════════════
//  NOTIFICATIONS
// ════════════════════════════════════════════════════════════

export async function sendNotification(userId, data) {
  const id = uid();
  await set(ref(db, `notifications/${userId}/${id}`), {
    ...data,
    id,
    createdAt: nowISO(),
    read: false,
  });
}

export async function getNotifications(userId) {
  const snap = await get(ref(db, `notifications/${userId}`));
  if (!snap.exists()) return [];
  const notifs = [];
  snap.forEach(c => notifs.push({ ...c.val(), id: c.key }));
  return notifs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

export async function markNotifRead(userId, notifId) {
  await update(ref(db, `notifications/${userId}/${notifId}`), { read: true });
}

export async function markAllNotifsRead(userId) {
  const notifs = await getNotifications(userId);
  const updates = {};
  notifs.forEach(n => { updates[`notifications/${userId}/${n.id}/read`] = true; });
  if (Object.keys(updates).length) await update(ref(db), updates);
}

// Realtime listener untuk notifikasi
export function listenNotifications(userId, callback) {
  const r = ref(db, `notifications/${userId}`);
  onValue(r, snap => {
    if (!snap.exists()) { callback([]); return; }
    const notifs = [];
    snap.forEach(c => notifs.push({ ...c.val(), id: c.key }));
    callback(notifs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
  });
  return () => off(r); // return unsubscribe function
}

// ════════════════════════════════════════════════════════════
//  VISIBILITY SETTINGS (per user)
// ════════════════════════════════════════════════════════════

// Default visibility settings per role
export const DEFAULT_VISIBILITY = {
  asst_manager: {
    seeAllSections:       true,
    seeAllProjects:       true,
    seeStaffDetails:      true,
    seeOtherSectionStaff: true,
    // Admin selalu full, tidak bisa diubah
    locked: true,
  },
  leader: {
    seeOtherSections:      true,   // benchmarking
    seeOtherSectionStaff:  false,
    myStaffSeeEachOther:   true,
    myProjectsVisibleAdmin: true,
  },
  staff: {
    seeSameSectionStaff:   true,
    seeOtherSections:      false,
    myProjectsVisibleLeader: true,
  },
};

export async function getVisibilitySettings(userId) {
  const snap = await get(ref(db, `visibilitySettings/${userId}`));
  if (snap.exists()) return snap.val();
  // Return default berdasarkan role
  const user = await getUser(userId);
  return DEFAULT_VISIBILITY[user?.role || 'staff'];
}

export async function saveVisibilitySettings(userId, settings) {
  await set(ref(db, `visibilitySettings/${userId}`), settings);
}

// ════════════════════════════════════════════════════════════
//  ANALYTICS
// ════════════════════════════════════════════════════════════

// ── ANALYTICS — single batch, tidak N+1 calls ──
export async function getSectionAnalytics(sectionId) {
  // Gunakan data yang sudah di-fetch, bukan fetch ulang
  const [projects, users] = await Promise.all([
    getProjectsBySection(sectionId),
    getUsersBySection(sectionId),
  ]);
  const total    = projects.length;
  const byStatus = { active: 0, paused: 0, done: 0, cancelled: 0 };
  let   totalSteps = 0, doneSteps = 0, totalPct = 0;
  for (const p of projects) {
    byStatus[p.status] = (byStatus[p.status] || 0) + 1;
    const steps = p.steps || [];
    totalSteps += steps.length;
    doneSteps  += steps.filter(s => s.done).length;
    totalPct   += total ? (steps.filter(s => s.done).length / (steps.length || 1)) * 100 : 0;
  }
  return {
    sectionId, total, byStatus, totalSteps, doneSteps,
    avgProgress: total ? Math.round(totalPct / total) : 0,
    memberCount: users.length,
  };
}

export async function getGlobalAnalytics() {
  // Fetch semua data SEKALI, lalu hitung dari memory — tidak ada N+1
  const [sections, allProjects, allUsers] = await Promise.all([
    getAllSections(),
    getAllProjects(),
    getAllUsers(),
  ]);

  return sections
    .filter(sec => sec.name && sec.name.trim() !== '')
    .map(sec => {
      const projects = allProjects.filter(p => p.sectionId === sec.id);
      const users    = allUsers.filter(u => u.sectionId === sec.id);
      const total    = projects.length;
      const byStatus = { active: 0, paused: 0, done: 0, cancelled: 0 };
      let totalSteps = 0, doneSteps = 0, totalPct = 0;
      for (const p of projects) {
        byStatus[p.status] = (byStatus[p.status] || 0) + 1;
        const steps = p.steps || [];
        totalSteps += steps.length;
        doneSteps  += steps.filter(s => s.done).length;
        totalPct   += total ? (steps.filter(s => s.done).length / (steps.length || 1)) * 100 : 0;
      }
      return {
        ...sec,
        sectionId:   sec.id,
        total,
        byStatus,
        totalSteps,
        doneSteps,
        avgProgress: total ? Math.round(totalPct / total) : 0,
        memberCount: users.length,
      };
    })
    .sort((a, b) => b.avgProgress - a.avgProgress);
}

// ════════════════════════════════════════════════════════════
//  SEED DATA
// ════════════════════════════════════════════════════════════

// Cek apakah seed diperlukan: users HARUS ada user_admin
export async function isSeedNeeded() {
  const snap = await get(ref(db, 'users/user_admin'));
  return !snap.exists();
}

// Hapus semua data lama & tulis ulang dengan ID yang benar
export async function runSeed(force = false) {
  if (!force) {
    const needed = await isSeedNeeded();
    if (!needed) {
      console.log('ℹ️ Seed tidak diperlukan — data sudah ada');
      return false;
    }
  }

  console.log('🌱 Menjalankan seed data...');

  // 1. Hapus data lama (sections & users dengan ID random)
  await remove(ref(db, 'sections'));
  await remove(ref(db, 'users'));

  // 2. Tulis sections dengan ID fixed
  const sections = [
    { name: 'HR',      order: 1,  color: '#3B82F6', empty: false },
    { name: 'GA',      order: 2,  color: '#10B981', empty: false },
    { name: 'LEGAL',   order: 3,  color: '#8B5CF6', empty: false },
    { name: 'HSE',     order: 4,  color: '#F59E0B', empty: false },
    { name: 'LND-BRI', order: 5,  color: '#F43F5E', empty: false },
    { name: 'LND-KI',  order: 6,  color: '#14B8A6', empty: false },
    { name: 'UTILITY', order: 7,  color: '#6366F1', empty: false },
    { name: '',        order: 8,  color: '#64748B', empty: true  },
    { name: '',        order: 9,  color: '#64748B', empty: true  },
    { name: '',        order: 10, color: '#64748B', empty: true  },
    { name: '',        order: 11, color: '#64748B', empty: true  },
    { name: '',        order: 12, color: '#64748B', empty: true  },
  ];
  const secIds = ['sec_hr','sec_ga','sec_legal','sec_hse','sec_lndbri','sec_lndki','sec_utility','sec_s8','sec_s9','sec_s10','sec_s11','sec_s12'];

  for (let i = 0; i < sections.length; i++) {
    // Jangan simpan id di dalam object — id sudah jadi Firebase key
    await set(ref(db, `sections/${secIds[i]}`), sections[i]);
  }

  // 3. Tulis users dengan ID fixed
  const users = [
    { id:'user_admin',     name:'Asst. Manager', role:'asst_manager', sectionId:null,          sectionOrder:0, password:'admin123', emoji:'👔', color:'#3B82F6', avatar:null },
    { id:'user_l_hr',      name:'Leader HR',      role:'leader',       sectionId:'sec_hr',      sectionOrder:1, password:'001',      emoji:'👷', color:'#3B82F6', avatar:null },
    { id:'user_l_ga',      name:'Leader GA',      role:'leader',       sectionId:'sec_ga',      sectionOrder:2, password:'002',      emoji:'🔧', color:'#10B981', avatar:null },
    { id:'user_l_legal',   name:'Leader Legal',   role:'leader',       sectionId:'sec_legal',   sectionOrder:3, password:'003',      emoji:'⚖️', color:'#8B5CF6', avatar:null },
    { id:'user_l_hse',     name:'Leader HSE',     role:'leader',       sectionId:'sec_hse',     sectionOrder:4, password:'004',      emoji:'🦺', color:'#F59E0B', avatar:null },
    { id:'user_l_lndbri',  name:'Leader LND-BRI', role:'leader',       sectionId:'sec_lndbri',  sectionOrder:5, password:'005',      emoji:'📚', color:'#F43F5E', avatar:null },
    { id:'user_l_lndki',   name:'Leader LND-KI',  role:'leader',       sectionId:'sec_lndki',   sectionOrder:6, password:'006',      emoji:'🎓', color:'#14B8A6', avatar:null },
    { id:'user_l_utility', name:'Leader Utility', role:'leader',       sectionId:'sec_utility', sectionOrder:7, password:'007',      emoji:'⚡', color:'#6366F1', avatar:null },
    { id:'user_s_hr1',     name:'Staff HR 1',     role:'staff',        sectionId:'sec_hr',      sectionOrder:1, password:'101',      emoji:'😊', color:'#3B82F6', avatar:null, leaderId:'user_l_hr'     },
    { id:'user_s_hr2',     name:'Staff HR 2',     role:'staff',        sectionId:'sec_hr',      sectionOrder:1, password:'102',      emoji:'🙂', color:'#3B82F6', avatar:null, leaderId:'user_l_hr'     },
    { id:'user_s_ga1',     name:'Staff GA 1',     role:'staff',        sectionId:'sec_ga',      sectionOrder:2, password:'201',      emoji:'😎', color:'#10B981', avatar:null, leaderId:'user_l_ga'     },
    { id:'user_s_hse1',    name:'Staff HSE 1',    role:'staff',        sectionId:'sec_hse',     sectionOrder:4, password:'401',      emoji:'🦺', color:'#F59E0B', avatar:null, leaderId:'user_l_hse'    },
  ];

  for (const u of users) {
    const { id, ...data } = u;
    await set(ref(db, `users/${id}`), { ...data, createdAt: nowISO() });
  }

  console.log('✅ Seed data selesai!');
  return true;
}

// Force reseed — hapus semua data lama dan seed ulang
export async function forceReseed() {
  await remove(ref(db, 'users'));
  await remove(ref(db, 'sections'));
  return runSeed(true);
}

// ════════════════════════════════════════════════════════════
//  V7 — GROUPS (per-room, per-user)
//  Disimpan di: projectGroups/{userId}/{groupId} = {name, color}
//  Mapping project→group: projectGroupMap/{userId}/{projectId} = groupId
// ════════════════════════════════════════════════════════════
export async function getGroups(userId) {
  const snap = await get(ref(db, `projectGroups/${userId}`));
  if (!snap.exists()) return [];
  const groups = [];
  snap.forEach(c => { const d = c.val(); if (d) groups.push({ ...d, id: c.key }); });
  return groups.sort((a,b) => (a.order||99)-(b.order||99));
}
export async function createGroup(userId, name, color = '#38BDF8') {
  const id = 'grp_' + uid();
  await set(ref(db, `projectGroups/${userId}/${id}`), { name, color, order: Date.now(), createdAt: nowISO() });
  return id;
}
export async function deleteGroup(userId, groupId) {
  await remove(ref(db, `projectGroups/${userId}/${groupId}`));
  // Bersihkan mapping project yang pakai group ini
  const snap = await get(ref(db, `projectGroupMap/${userId}`));
  if (snap.exists()) {
    snap.forEach(c => { if (c.val() === groupId) remove(ref(db, `projectGroupMap/${userId}/${c.key}`)); });
  }
}
export async function getGroupMap(userId) {
  const snap = await get(ref(db, `projectGroupMap/${userId}`));
  if (!snap.exists()) return {};
  return snap.val(); // { projectId: groupId }
}
export async function setProjectGroup(userId, projectId, groupId) {
  if (!groupId) { await remove(ref(db, `projectGroupMap/${userId}/${projectId}`)); return; }
  await set(ref(db, `projectGroupMap/${userId}/${projectId}`), groupId);
}

// ════════════════════════════════════════════════════════════
//  V7 — STATUS AUTOMATION (plan/actual, auto-pause, verify close)
// ════════════════════════════════════════════════════════════

// Hitung progress project dari steps
export function calcProgress(project) {
  const steps = project.steps || [];
  if (!steps.length) return 0;
  return Math.round(steps.filter(s => s.done).length / steps.length * 100);
}

// Dipanggil setelah update steps — kelola transisi status & actualEnd otomatis
// Returns: status baru
export async function recomputeProjectStatus(projectId) {
  const snap = await get(ref(db, `projects/${projectId}`));
  if (!snap.exists()) return null;
  const p = { ...snap.val(), id: projectId };
  // Jangan ubah project yang sudah closed/cancelled oleh admin
  if (p.status === 'closed' || p.status === 'cancelled') return p.status;

  const prog = calcProgress(p);
  const updates = {};

  if (prog === 100) {
    // 100% → waiting_validation + lock actualEnd (jika belum)
    if (p.status !== 'waiting_validation') updates.status = 'waiting_validation';
    if (!p.actualEnd) updates.actualEnd = nowISO();
  } else {
    // < 100% → kembali open + kosongkan actualEnd
    if (p.status === 'waiting_validation') updates.status = 'open';
    if (p.actualEnd) updates.actualEnd = null;
    // Kalau sebelumnya open tetap open (auto-pause ditangani terpisah)
    if (p.status !== 'open' && p.status !== 'need_action') updates.status = 'open';
  }
  if (Object.keys(updates).length) {
    updates.updatedAt = nowISO();
    await update(ref(db, `projects/${projectId}`), updates);
  }
  return updates.status || p.status;
}

// Auto-pause: project 'open' yang tidak di-update > 3 hari → need_action
export async function autoPauseStale() {
  const snap = await get(ref(db, 'projects'));
  if (!snap.exists()) return;
  const now = Date.now();
  const THREE = 3 * 24 * 60 * 60 * 1000;
  const tasks = [];
  snap.forEach(c => {
    const p = c.val(); if (!p) return;
    if (p.status === 'open' && p.updatedAt) {
      if (now - new Date(p.updatedAt).getTime() > THREE) {
        tasks.push(update(ref(db, `projects/${c.key}`), { status: 'need_action' }));
      }
    }
  });
  await Promise.all(tasks);
}

// Admin verifikasi close (ketok palu) — dengan catatan
export async function verifyCloseProject(projectId, adminId, note = '') {
  await update(ref(db, `projects/${projectId}`), {
    status:     'closed',
    closedAt:   nowISO(),
    closedBy:   adminId,
    closeNote:  note || '',
    updatedAt:  nowISO(),
  });
  // Notif ke owner project
  const snap = await get(ref(db, `projects/${projectId}`));
  if (snap.exists()) {
    const p = snap.val();
    if (p.actualOwner) {
      await sendNotification(p.actualOwner, {
        type:'project_closed', projectId,
        title:'Project Disetujui Close',
        body:`Project "${p.name}" telah diverifikasi & ditutup oleh Admin${note?': '+note:''}`,
        read:false,
      });
    }
  }
}

// Admin batalkan validasi (kembalikan ke open) jika belum sesuai
export async function rejectValidation(projectId, note = '') {
  await update(ref(db, `projects/${projectId}`), {
    status: 'open', actualEnd: null, updatedAt: nowISO(),
    validationNote: note || '',
  });
}

// ════════════════════════════════════════════════════════════
//  V7 — PROJECT CHAT (per-project, realtime)
//  chats/{projectId}/{msgId} = {userId, userName, avatar, text, ts}
// ════════════════════════════════════════════════════════════
export async function sendChatMessage(projectId, msg) {
  const id = uid();
  await set(ref(db, `chats/${projectId}/${id}`), {
    userId:   msg.userId,
    userName: msg.userName || '',
    avatar:   msg.avatar || null,
    color:    msg.color || '#38BDF8',
    text:     msg.text || '',
    ts:       nowISO(),
  });
  return id;
}
export function listenChat(projectId, callback) {
  const r = ref(db, `chats/${projectId}`);
  onValue(r, snap => {
    if (!snap.exists()) { callback([]); return; }
    const msgs = [];
    snap.forEach(c => { const d = c.val(); if (d) msgs.push({ ...d, id: c.key }); });
    msgs.sort((a,b) => new Date(a.ts) - new Date(b.ts));
    callback(msgs);
  });
  return () => off(r);
}
export async function getChatCount(projectId) {
  const snap = await get(ref(db, `chats/${projectId}`));
  return snap.exists() ? Object.keys(snap.val()).length : 0;
}

// ════════════════════════════════════════════════════════════
//  V7 — RESET DATA (hapus semua KECUALI users & sections)
// ════════════════════════════════════════════════════════════
export async function resetAllExceptUsersSections() {
  await Promise.all([
    remove(ref(db, 'projects')),
    remove(ref(db, 'collabRequests')),
    remove(ref(db, 'notifications')),
    remove(ref(db, 'projectContributions')),
    remove(ref(db, 'chats')),
    remove(ref(db, 'projectGroups')),
    remove(ref(db, 'projectGroupMap')),
  ]);
  return true;
}

// ════════════════════════════════════════════════════════════
//  V7 — PROJECT TEMPLATES (dibuat admin, dipakai semua room)
//  Copy-on-use: template di-copy saat dipakai, edit template
//  hanya berlaku untuk project baru (yang berjalan tidak ikut)
//  projectTemplates/{templateId} = {name, desc, priority, steps[], createdBy, updatedAt}
// ════════════════════════════════════════════════════════════
export async function getTemplates() {
  const snap = await get(ref(db, 'projectTemplates'));
  if (!snap.exists()) return [];
  const tpls = [];
  snap.forEach(c => { const d = c.val(); if (d) tpls.push({ ...d, id: c.key }); });
  return tpls.sort((a,b) => (a.name||'').localeCompare(b.name||''));
}
export async function createTemplate(data) {
  const id = 'tpl_' + uid();
  const { id: _ig, ...clean } = data;
  await set(ref(db, `projectTemplates/${id}`), {
    ...clean,
    steps:     data.steps || [],   // [{name, durationDays, priority}]
    priority:  data.priority || 'medium',
    createdAt: nowISO(),
    updatedAt: nowISO(),
  });
  return id;
}
export async function updateTemplate(templateId, data) {
  const { id: _ig, ...clean } = data;
  await update(ref(db, `projectTemplates/${templateId}`), { ...clean, updatedAt: nowISO() });
}
export async function deleteTemplate(templateId) {
  await remove(ref(db, `projectTemplates/${templateId}`));
}

// ════════════════════════════════════════════════════════════
//  V7 — MONITORING COLOR INDICATOR (dinamis, ganti warna custom)
//  Mengembalikan: 'red' | 'yellow' | 'blue' | 'normal'
//  ownerId = pemilik room (untuk cek step yg PIC-nya dia)
// ════════════════════════════════════════════════════════════
export function getProjectIndicator(project, ownerId = null) {
  if (project.status === 'closed') return 'normal';
  const today = new Date(); today.setHours(0,0,0,0);
  const steps = project.steps || [];
  const prog = calcProgress(project);

  // MERAH: overdue (lewat end plan & belum 100%) atau need_action
  if (project.status === 'need_action') return 'red';
  if (project.end && prog < 100) {
    const end = new Date(project.end); end.setHours(0,0,0,0);
    if (today > end) return 'red';
  }

  // Cek step milik owner room (jika ownerId diberikan)
  if (ownerId) {
    const myUndoneSteps = steps.filter(s => s.pic === ownerId && !s.done && s.start);
    // KUNING: ada step owner yg start <= today (harus dikerjakan)
    for (const s of myUndoneSteps) {
      const st = new Date(s.start); st.setHours(0,0,0,0);
      if (st <= today) return 'yellow';
    }
    // BIRU: ada step owner yg start dalam 1-3 hari ke depan
    for (const s of myUndoneSteps) {
      const st = new Date(s.start); st.setHours(0,0,0,0);
      const diff = (st - today) / (1000*60*60*24);
      if (diff >= 1 && diff <= 3) return 'blue';
    }
  } else {
    // Admin/project-level: cek overdue step
    const anyOverdueStep = steps.some(s => !s.done && s.end && new Date(s.end) < today);
    if (anyOverdueStep) return 'yellow';
  }
  return 'normal';
}

// Warna hex dari indikator
export function indicatorColor(ind) {
  return ({ red:'#FB7185', yellow:'#FBBF24', blue:'#38BDF8', normal:'#475569' })[ind] || '#475569';
}

// ════════════════════════════════════════════════════════════
//  REALTIME LISTENERS
// ════════════════════════════════════════════════════════════

export function listenProjects(callback) {
  const r = ref(db, 'projects');
  onValue(r, snap => {
    if (!snap.exists()) { callback([]); return; }
    const projs = [];
    snap.forEach(c => projs.push({ ...c.val(), id: c.key }));
    callback(projs);
  });
  return () => off(r);
}

export function listenUsers(callback) {
  const r = ref(db, 'users');
  onValue(r, snap => {
    if (!snap.exists()) { callback([]); return; }
    const users = [];
    snap.forEach(c => users.push({ ...c.val(), id: c.key }));
    callback(users);
  });
  return () => off(r);
}

// Export db instance untuk penggunaan langsung jika dibutuhkan
export { db, ref, set, get, push, update, remove, onValue, off };
