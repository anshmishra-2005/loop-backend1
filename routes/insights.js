import express from 'express';
import Feedback from '../models/Feedback.js';
import Theme from '../models/Theme.js';
import { requireAuth } from '../middleware/auth.js';
import { generateEmbedding, cosineSimilarity, answerQuestion } from '../lib/ai.js';

const router = express.Router();

// Ask LOOP Q&A
router.post('/ask', requireAuth, async (req, res) => {
  try {
    const { question } = req.body;
    if (!question) {
      return res.status(400).json({ error: 'Question is required' });
    }

    // 1. Embed the question
    const queryVector = generateEmbedding(question);

    // 2. Fetch all feedback for the workspace (in a real app, use vector DB search)
    // Here we do in-memory dot product since we have a small dataset
    const allFeedback = await Feedback.find({ workspaceId: req.user.workspaceId, embedding: { $exists: true, $not: {$size: 0} } });

    // 3. Calculate similarities
    const scored = allFeedback.map(fb => ({
      feedback: fb,
      score: cosineSimilarity(queryVector, fb.embedding)
    }));

    // 4. Sort and pick top K
    scored.sort((a, b) => b.score - a.score);
    const topK = scored.slice(0, 5).map(s => s.feedback);

    // 5. Ask Claude
    const answer = await answerQuestion(question, topK);

    res.json({
      answer,
      citations: topK.map(f => ({ id: f._id, content: f.content, channel: f.channel }))
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get themes with volume trends
router.get('/themes', requireAuth, async (req, res) => {
  try {
    const workspaceId = req.user.workspaceId;
    const themes = await Theme.find({ workspaceId });
    
    // Aggregate feedback counts per theme
    const themeCounts = await Feedback.aggregate([
      { $match: { workspaceId } },
      { $unwind: "$themes" },
      { $group: { _id: "$themes", count: { $sum: 1 } } }
    ]);

    const countMap = {};
    themeCounts.forEach(t => { countMap[t._id.toString()] = t.count; });

    const result = themes.map(t => ({
      id: t._id,
      name: t.name,
      count: countMap[t._id.toString()] || 0
    })).sort((a, b) => b.count - a.count);

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
