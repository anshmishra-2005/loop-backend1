import express from 'express';
import multer from 'multer';
import csv from 'csv-parser';
import fs from 'fs';
import Feedback from '../models/Feedback.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();
const upload = multer({ dest: 'uploads/' });

// Get feedback with pagination, search, and filters
router.get('/', requireAuth, async (req, res) => {
  try {
    const { page = 1, limit = 10, search, channel, sentiment, status } = req.query;
    
    let query = { workspaceId: req.user.workspaceId };

    if (search) {
      query.content = { $regex: search, $options: 'i' };
    }
    if (channel) query.channel = channel;
    if (sentiment) query.sentiment = sentiment;
    if (status) query.status = status;

    const feedback = await Feedback.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));

    const total = await Feedback.countDocuments(query);

    res.json({
      feedback,
      totalPages: Math.ceil(total / limit),
      currentPage: Number(page),
      total
    });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

import { classifyFeedback, generateEmbedding } from '../lib/ai.js';
import Theme from '../models/Theme.js';

// ... 

// Create single feedback
router.post('/', requireAuth, async (req, res) => {
  try {
    const { content, channel } = req.body;
    
    // Get AI classification
    const existingThemes = await Theme.find({ workspaceId: req.user.workspaceId }).select('name');
    const aiResult = await classifyFeedback(content, existingThemes.map(t => t.name));
    const embedding = generateEmbedding(content);

    // Map AI themes to Theme IDs (creating new ones if necessary)
    const themeIds = [];
    if (aiResult.themes && Array.isArray(aiResult.themes)) {
      for (const themeName of aiResult.themes) {
        let theme = await Theme.findOne({ name: themeName, workspaceId: req.user.workspaceId });
        if (!theme) {
          theme = new Theme({ name: themeName, workspaceId: req.user.workspaceId });
          await theme.save();
        }
        themeIds.push(theme._id);
      }
    }

    const feedback = new Feedback({
      content,
      channel,
      workspaceId: req.user.workspaceId,
      sentiment: aiResult.sentiment || 'NEU', 
      sentimentScore: aiResult.sentimentScore || 0,
      featureArea: aiResult.featureArea,
      themes: themeIds,
      embedding
    });

    await feedback.save();
    res.status(201).json(feedback);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Bulk CSV import
router.post('/bulk', requireAuth, upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const results = [];
  fs.createReadStream(req.file.path)
    .pipe(csv())
    .on('data', (data) => results.push(data))
    .on('end', async () => {
      try {
        const feedbackDocs = results.map(row => ({
          content: row.content,
          channel: row.channel || 'CSV Import',
          sentiment: row.sentiment ? row.sentiment.substring(0,3).toUpperCase() : 'NEU',
          workspaceId: req.user.workspaceId,
        }));

        await Feedback.insertMany(feedbackDocs);
        fs.unlinkSync(req.file.path); // Clean up
        res.status(201).json({ message: `Imported ${feedbackDocs.length} items` });
      } catch (error) {
        res.status(500).json({ error: 'Error processing CSV' });
      }
    });
});

// Update status
router.patch('/:id/status', requireAuth, async (req, res) => {
  try {
    const { status } = req.body;
    const feedback = await Feedback.findOneAndUpdate(
      { _id: req.params.id, workspaceId: req.user.workspaceId },
      { status },
      { new: true }
    );

    if (!feedback) {
      return res.status(404).json({ error: 'Feedback not found' });
    }

    res.json(feedback);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Dashboard stats
router.get('/stats', requireAuth, async (req, res) => {
  try {
    const workspaceId = req.user.workspaceId;
    
    const total = await Feedback.countDocuments({ workspaceId });
    const negative = await Feedback.countDocuments({ workspaceId, sentiment: 'NEG' });
    
    // Group by date for volume chart
    const volumeData = await Feedback.aggregate([
      { $match: { workspaceId } },
      { $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          count: { $sum: 1 }
      }},
      { $sort: { _id: 1 } },
      { $limit: 7 }
    ]);

    // Group by sentiment
    const sentimentData = await Feedback.aggregate([
      { $match: { workspaceId } },
      { $group: {
          _id: "$sentiment",
          count: { $sum: 1 }
      }}
    ]);

    res.json({
      total,
      percentNegative: total > 0 ? Math.round((negative / total) * 100) : 0,
      volumeData: volumeData.map(v => ({ date: v._id, count: v.count })),
      sentimentData: sentimentData.map(s => ({ name: s._id || 'UNCLASSIFIED', value: s.count }))
    });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
