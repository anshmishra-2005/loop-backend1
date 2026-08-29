import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import User from './models/User.js';
import Workspace from './models/Workspace.js';
import Feedback from './models/Feedback.js';

dotenv.config();

const seedData = [
  { content: "Onboarding took forever — I couldn't figure out how to invite my team.", channel: 'Support Ticket', sentiment: 'NEG' },
  { content: "The new dashboard is gorgeous and finally fast. Huge improvement.", channel: 'App Store Review', sentiment: 'POS' },
  { content: "It does the job, but the mobile experience needs work.", channel: 'NPS Survey', sentiment: 'NEU' },
  { content: "Prospect wants SSO before they'll sign — third time this month.", channel: 'Sales Call Note', sentiment: 'NEG' },
  { content: "Love the new export feature, saved me an hour today.", channel: 'Community Post', sentiment: 'POS' },
  { content: "Billing page keeps timing out when I try to download an invoice.", channel: 'Support Ticket', sentiment: 'NEG' },
];

async function seed() {
  const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/loop-project';
  await mongoose.connect(MONGODB_URI);
  console.log('Connected to MongoDB for seeding');

  // Clear existing
  await Workspace.deleteMany({});
  await User.deleteMany({});
  await Feedback.deleteMany({});

  // Create workspace
  const workspace = new Workspace({ name: 'Demo Company' });
  await workspace.save();
  console.log('Created workspace');

  // Create users
  const salt = await bcrypt.genSalt(10);
  const hash = await bcrypt.hash('password123', salt);

  const admin = new User({ name: 'Admin User', email: 'admin@demo.com', passwordHash: hash, role: 'ADMIN', workspaceId: workspace._id });
  const analyst = new User({ name: 'Analyst User', email: 'analyst@demo.com', passwordHash: hash, role: 'ANALYST', workspaceId: workspace._id });
  const viewer = new User({ name: 'Viewer User', email: 'viewer@demo.com', passwordHash: hash, role: 'VIEWER', workspaceId: workspace._id });
  
  await Promise.all([admin.save(), analyst.save(), viewer.save()]);
  console.log('Created 3 users');

  // Generate 120 feedbacks by duplicating the seedData
  const feedbackDocs = [];
  for (let i = 0; i < 20; i++) {
    for (const item of seedData) {
      feedbackDocs.push({
        ...item,
        workspaceId: workspace._id,
        createdAt: new Date(Date.now() - Math.floor(Math.random() * 30) * 24 * 60 * 60 * 1000) // Random date in last 30 days
      });
    }
  }

  await Feedback.insertMany(feedbackDocs);
  console.log(`Seeded ${feedbackDocs.length} feedback items`);

  console.log('Seeding complete. Admin login: admin@demo.com / password123');
  process.exit(0);
}

seed().catch(err => {
  console.error(err);
  process.exit(1);
});
