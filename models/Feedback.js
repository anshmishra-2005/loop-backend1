import mongoose from 'mongoose';

const feedbackSchema = new mongoose.Schema({
  content: {
    type: String,
    required: true,
  },
  channel: {
    type: String,
    required: true,
  },
  sentiment: {
    type: String,
    enum: ['POS', 'NEU', 'NEG'],
  },
  sentimentScore: {
    type: Number,
    min: -1,
    max: 1,
  },
  featureArea: String,
  embedding: [Number],
  status: {
    type: String,
    enum: ['NEW', 'REVIEWED', 'ACTIONED'],
    default: 'NEW',
  },
  workspaceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Workspace',
    required: true,
  },
  themes: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Theme'
  }]
}, { timestamps: true });

export default mongoose.model('Feedback', feedbackSchema);
