const mongoose = require('mongoose');

const offerSchema = new mongoose.Schema({
  title: {
     type: String, 
     required: true 
    },
  offerType: { 
    type: String, enum: ['product', 'category'], required: true 
},
  product: { 
    type: mongoose.Schema.Types.ObjectId, ref: 'Product' 
},
  category: { 
    type: mongoose.Schema.Types.ObjectId, ref: 'Category' 
},
  discountType: {
     type: String, enum: ['percentage', 'flat'], default: 'percentage'
     },
  discountValue: { 
    type: Number, 
    required: true 
},
  endDate: {
     type: Date, 
     required: true 
    },
  isActive: { 
    type: Boolean, 
    default: true
},
});

module.exports = mongoose.model('Offer', offerSchema);
