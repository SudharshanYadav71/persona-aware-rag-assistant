import crypto from 'crypto';
import { db } from '../src/lib/ml/memoryResolver';
import {
  generateToken,
  generateUserId,
  hashPassword,
  validatePassword,
  validateUsername,
  verifyPassword,
  verifyToken,
} from '../src/lib/auth';

type TestUser = {
  id: string;
  username: string;
  passwordHash: string;
};

const TEST_PASSWORD = 'TestPass123!';
const USER_ONE = `smk_${Date.now().toString(36).slice(-6)}`;
const USER_TWO = `${USER_ONE}_alt`;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function cleanupUser(username: string) {
  db.prepare('DELETE FROM memories WHERE userId IN (SELECT id FROM users WHERE username = ?)').run(username);
  db.prepare('DELETE FROM users WHERE username = ?').run(username);
}

async function createUser(username: string, password: string): Promise<TestUser> {
  const usernameCheck = validateUsername(username);
  assert(usernameCheck.valid, usernameCheck.error || 'Invalid username');

  const passwordCheck = validatePassword(password);
  assert(passwordCheck.valid, passwordCheck.error || 'Invalid password');

  cleanupUser(username);

  const id = generateUserId();
  const passwordHash = await hashPassword(password);

  db.prepare('INSERT INTO users (id, username, passwordHash, createdAt) VALUES (?, ?, ?, ?)')
    .run(id, username, passwordHash, Date.now());

  const stored = db.prepare('SELECT id, username, passwordHash FROM users WHERE username = ?').get(username) as TestUser | undefined;
  assert(stored, 'USER CREATED but not found in SQLite');
  assert(await verifyPassword(password, stored.passwordHash), 'Stored password hash failed verification');

  console.log('USER CREATED', username);
  return stored;
}

async function signinAndToken(user: TestUser, password: string) {
  const record = db.prepare('SELECT id, username, passwordHash FROM users WHERE username = ?').get(user.username) as TestUser | undefined;
  assert(record, 'Signin user not found');
  const ok = await verifyPassword(password, record.passwordHash);
  assert(ok, 'LOGIN FAILED');

  const token = generateToken({ id: record.id, username: record.username });
  const verified = verifyToken(token);
  assert(verified?.id === record.id, 'TOKEN GENERATED but verification failed');

  console.log('TOKEN GENERATED', record.username);
  return token;
}

function storeMemory(userId: string, content: string) {
  const memoryId = crypto.randomUUID();
  db.prepare(`
    INSERT INTO memories (id, userId, content, embedding, timestamp, emotionalWeight, importanceScore, layer, decayRate, tags, faiss_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    memoryId,
    userId,
    content,
    null,
    Date.now(),
    0.5,
    0.6,
    'short-term',
    0.06,
    JSON.stringify(['smoke-test']),
    Math.floor(Math.random() * 1_000_000)
  );

  const inserted = db.prepare('SELECT id, userId, content FROM memories WHERE id = ?').get(memoryId) as { id: string; userId: string; content: string } | undefined;
  assert(inserted?.content === content, 'MEMORY INSERTED check failed');

  console.log('MEMORY INSERTED', content);
}

function retrieveMemory(userId: string, expectedText: string) {
  const result = db.prepare('SELECT id, userId, content FROM memories WHERE userId = ? AND content LIKE ?').all(userId, `%${expectedText}%`) as Array<{ id: string; userId: string; content: string }>;
  assert(result.length > 0, 'SISTER MEMORY FOUND check failed');

  console.log('SISTER MEMORY FOUND', result[0].content);
}

function crossUserIsolation(userOneId: string, userTwoId: string) {
  const userTwoMemories = db.prepare('SELECT id FROM memories WHERE userId = ?').all(userTwoId) as Array<{ id: string }>;
  assert(userTwoMemories.length > 0, 'Second user should have at least one memory');

  const leaked = db.prepare('SELECT id FROM memories WHERE userId = ? AND content LIKE ?').all(userOneId, '%private second user memory%') as Array<{ id: string }>;
  assert(leaked.length === 0, 'NO ACCESS check failed');

  console.log('NO ACCESS', userOneId, 'cannot see', userTwoId);
}

async function main() {
  db.pragma('foreign_keys = ON');

  cleanupUser(USER_ONE);
  cleanupUser(USER_TWO);

  const userOne = await createUser(USER_ONE, TEST_PASSWORD);
  await signinAndToken(userOne, TEST_PASSWORD);
  storeMemory(userOne.id, 'My sister moved to Delhi');
  retrieveMemory(userOne.id, 'sister moved to Delhi');

  const wrongPasswordOk = await verifyPassword('wrong-password', userOne.passwordHash);
  assert(!wrongPasswordOk, 'LOGIN FAILED check failed');
  console.log('LOGIN FAILED', USER_ONE, 'with wrong password');

  const userTwo = await createUser(USER_TWO, TEST_PASSWORD);
  storeMemory(userTwo.id, 'private second user memory');
  crossUserIsolation(userOne.id, userTwo.id);

  console.log('SQLite auth smoke test passed.');
}

main().catch((error) => {
  console.error('SQLite auth smoke test failed:', error);
  process.exitCode = 1;
});