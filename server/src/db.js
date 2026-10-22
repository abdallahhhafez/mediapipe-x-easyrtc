import mongoose from 'mongoose';

// Connects to MONGODB_URI if set. Otherwise spins up an in-process MongoDB
// (mongodb-memory-server) so the whole stack runs with zero external setup.
// Set MONGODB_URI to use a real, persistent database.

let memoryServer = null;

export async function connectDb() {
  const uri = process.env.MONGODB_URI;
  if (uri) {
    await mongoose.connect(uri);
    return uri;
  }
  const { MongoMemoryServer } = await import('mongodb-memory-server');
  memoryServer = await MongoMemoryServer.create();
  const memUri = memoryServer.getUri();
  await mongoose.connect(memUri);
  return `${memUri} (in-memory)`;
}

export async function disconnectDb() {
  await mongoose.disconnect();
  if (memoryServer) await memoryServer.stop();
}
