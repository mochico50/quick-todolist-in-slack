const { Firestore } = require('@google-cloud/firestore');

const COLLECTION = 'orders';

function getDb() {
  return new Firestore({ projectId: process.env.GOOGLE_CLOUD_PROJECT });
}

/**
 * @param {string} gmailThreadId
 * @returns {Promise<(import('../../docs/interfaces').Order & { _id: string }) | null>}
 */
async function findOrderByGmailThreadId(gmailThreadId) {
  const db = getDb();
  const snap = await db.collection(COLLECTION).where('gmail_thread_id', '==', gmailThreadId).get();
  if (snap.empty) return null;
  const doc = snap.docs[0];
  return { _id: doc.id, ...doc.data() };
}

/**
 * @param {import('../../docs/interfaces').Order} order
 * @returns {Promise<string>}
 */
async function createOrder(order) {
  const db = getDb();
  const ref = await db.collection(COLLECTION).add(order);
  return ref.id;
}

/**
 * @param {string} docId
 * @param {Partial<import('../../docs/interfaces').Order>} fields
 * @returns {Promise<void>}
 */
async function updateOrder(docId, fields) {
  const db = getDb();
  await db.collection(COLLECTION).doc(docId).update(fields);
}

/**
 * @param {string} gmailThreadId
 * @returns {Promise<boolean>}
 */
async function isAlreadyProcessed(gmailThreadId) {
  const db = getDb();
  const snap = await db.collection(COLLECTION).where('gmail_thread_id', '==', gmailThreadId).get();
  return !snap.empty;
}

module.exports = { findOrderByGmailThreadId, createOrder, updateOrder, isAlreadyProcessed };
