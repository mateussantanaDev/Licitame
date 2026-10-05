"use client"

import { initializeApp, getApps, type FirebaseApp } from "firebase/app"
import {
  getFirestore,
  collection,
  doc,
  getDocs,
  getDoc,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  type Firestore,
} from "firebase/firestore"
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  sendPasswordResetEmail,
  updateProfile,
  type Auth,
  type User as FirebaseUser,
} from "firebase/auth"

// Firebase configuration - use environment variables
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
}

// Initialize Firebase
let app: FirebaseApp | undefined
let db: Firestore | undefined
let auth: Auth | undefined

function getFirebaseApp(): FirebaseApp {
  if (!app) {
    const apps = getApps()
    if (apps.length === 0) {
      app = initializeApp(firebaseConfig)
    } else {
      app = apps[0]
    }
  }
  return app
}

export function getFirestoreDb(): Firestore {
  if (!db) {
    db = getFirestore(getFirebaseApp())
  }
  return db
}

function getFirebaseAuth(): Auth {
  if (!auth) {
    auth = getAuth(getFirebaseApp())
  }
  return auth
}

// --- Firebase Auth helpers ---

export async function signIn(email: string, password: string) {
  const auth = getFirebaseAuth()
  return signInWithEmailAndPassword(auth, email, password)
}

export async function signUp(email: string, password: string, displayName: string) {
  const auth = getFirebaseAuth()
  const credential = await createUserWithEmailAndPassword(auth, email, password)
  await updateProfile(credential.user, { displayName })
  return credential
}

export async function signOutUser() {
  const auth = getFirebaseAuth()
  return firebaseSignOut(auth)
}

export async function resetPassword(email: string) {
  const auth = getFirebaseAuth()
  return sendPasswordResetEmail(auth, email)
}

export function onAuthChange(callback: (user: FirebaseUser | null) => void) {
  const auth = getFirebaseAuth()
  return onAuthStateChanged(auth, callback)
}

// Check if Firebase is configured
export function isFirebaseConfigured(): boolean {
  return !!(
    process.env.NEXT_PUBLIC_FIREBASE_API_KEY &&
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
  )
}

// Collections
export const COLLECTIONS = {
  CONTRACTS: "contracts",
  SUPPLIERS: "suppliers",
  ORDERS: "orders",
  PRODUCTS: "products",
  USERS: "users",
  NOTIFICATIONS: "notifications",
  COST_BASES: "costBases",
  REPORTS: "reports",
} as const

// Generic CRUD operations
export async function getAllDocuments<T>(collectionName: string): Promise<T[]> {
  if (!isFirebaseConfigured()) return []
  
  try {
    const db = getFirestoreDb()
    const querySnapshot = await getDocs(collection(db, collectionName))
    return querySnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as T[]
  } catch (error) {
    console.error(`Error getting documents from ${collectionName}:`, error)
    return []
  }
}

export async function getDocumentById<T>(collectionName: string, id: string): Promise<T | null> {
  if (!isFirebaseConfigured()) return null
  
  try {
    const db = getFirestoreDb()
    const docRef = doc(db, collectionName, id)
    const docSnap = await getDoc(docRef)
    
    if (docSnap.exists()) {
      return { id: docSnap.id, ...docSnap.data() } as T
    }
    return null
  } catch (error) {
    console.error(`Error getting document ${id} from ${collectionName}:`, error)
    return null
  }
}

function removeUndefined<T>(obj: T): T {
  if (obj === null || obj === undefined) return obj
  if (Array.isArray(obj)) {
    return obj.map((item) => removeUndefined(item)) as unknown as T
  }
  if (typeof obj === "object" && !(obj instanceof Date)) {
    const cleaned: Record<string, any> = {}
    for (const [key, value] of Object.entries(obj)) {
      if (value !== undefined) {
        cleaned[key] = removeUndefined(value)
      }
    }
    return cleaned as T
  }
  return obj
}

export async function addDocument<T extends object>(collectionName: string, data: T): Promise<string | null> {
  if (!isFirebaseConfigured()) return null
  
  try {
    const db = getFirestoreDb()
    const cleanedData = removeUndefined({
      ...data,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
    const docRef = await addDoc(collection(db, collectionName), cleanedData)
    return docRef.id
  } catch (error) {
    console.error(`Error adding document to ${collectionName}:`, error)
    return null
  }
}

export async function setDocument<T extends object>(
  collectionName: string,
  id: string,
  data: T
): Promise<boolean> {
  if (!isFirebaseConfigured()) return false
  
  try {
    const db = getFirestoreDb()
    const docRef = doc(db, collectionName, id)
    const cleanedData = removeUndefined({
      ...data,
      updatedAt: new Date().toISOString(),
    })
    await setDoc(docRef, cleanedData, { merge: true })
    return true
  } catch (error) {
    console.error(`Error setting document ${id} in ${collectionName}:`, error)
    return false
  }
}

export async function updateDocument<T extends object>(
  collectionName: string,
  id: string,
  data: Partial<T>
): Promise<boolean> {
  if (!isFirebaseConfigured()) return false
  
  try {
    const db = getFirestoreDb()
    const docRef = doc(db, collectionName, id)
    const cleanedData = removeUndefined({
      ...data,
      updatedAt: new Date().toISOString(),
    })
    await setDoc(docRef, cleanedData, { merge: true })
    return true
  } catch (error) {
    console.error(`Error updating document ${id} in ${collectionName}:`, error)
    return false
  }
}

export async function deleteDocument(collectionName: string, id: string): Promise<boolean> {
  if (!isFirebaseConfigured()) return false
  
  try {
    const db = getFirestoreDb()
    const docRef = doc(db, collectionName, id)
    await deleteDoc(docRef)
    return true
  } catch (error) {
    console.error(`Error deleting document ${id} from ${collectionName}:`, error)
    return false
  }
}

export async function queryDocuments<T>(
  collectionName: string,
  field: string,
  operator: "==" | "!=" | "<" | "<=" | ">" | ">=" | "array-contains",
  value: unknown
): Promise<T[]> {
  if (!isFirebaseConfigured()) return []
  
  try {
    const db = getFirestoreDb()
    const q = query(collection(db, collectionName), where(field, operator, value))
    const querySnapshot = await getDocs(q)
    return querySnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as T[]
  } catch (error) {
    console.error(`Error querying documents from ${collectionName}:`, error)
    return []
  }
}

export { query, where, orderBy, collection, doc, getDocs }
export { getFirebaseApp };
