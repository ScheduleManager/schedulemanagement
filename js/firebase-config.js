// js/firebase-config.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, collection, addDoc, onSnapshot, doc, updateDoc, deleteDoc, query, orderBy, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyDILs6zPfC0UdPL7crGbAot-w2vt5eCGgk",
    authDomain: "flutter-ai-playground-c65f3.firebaseapp.com",
    projectId: "flutter-ai-playground-c65f3",
    storageBucket: "flutter-ai-playground-c65f3.appspot.com",
    messagingSenderId: "932092331324",
    appId: "1:932092331324:web:dcbb33b44b5d55a43cca39"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: 'select_account' });

export { auth, db, provider, signInWithPopup, signOut, onAuthStateChanged, collection, query, orderBy, onSnapshot, serverTimestamp };

window.dbActions = {
    add: async (data) => {
        const user = auth.currentUser;
        if (!user) return alert("Vui lòng đăng nhập!");
        await addDoc(collection(db, "users", user.uid, "tasks"), { ...data, createdAt: serverTimestamp() });
    },
    update: async (id, data) => {
        const user = auth.currentUser;
        if (!user) return alert("Vui lòng đăng nhập!");
        await updateDoc(doc(db, "users", user.uid, "tasks", id), data);
    },
    delete: async (id) => {
        const user = auth.currentUser;
        if (!user) return alert("Vui lòng đăng nhập!");
        await deleteDoc(doc(db, "users", user.uid, "tasks", id));
    }
};