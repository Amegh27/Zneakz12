const mongoose = require('mongoose');
const { Schema } = mongoose;

const walletSchema = new Schema({
  balance: { type: Number, default: 0 }
});

const userSchema = new Schema({
  name: {
    type: String,
    required: true
  },
  email: {
    type: String,
    required: true,
    unique: true
  },
  googleId: {
    type: String,
    required: false
  },
  password: {
    type: String,
    required: false
  },
  phone: {
    type: String,
    default: ''
  },
  gender: {
    type: String,
    enum: ['Male', 'Female', 'Other'],
  },
  avatar: {
    type: String,
    default: '/images/user-avatar.png'
  },
  address: {
    type: [
      {
        name: String,
        city: String,
        state: String,
        pincode: String,
      }
    ],
    default: []  
  },
  wallet: {
    type: walletSchema,
    default: {}
  },
  isBlocked: {
    type: Boolean,
    default: false
  },
  isAdmin: {
    type: Boolean,
    default: false
  }
}, { timestamps: true });

const User = mongoose.model('User', userSchema);
module.exports = User;