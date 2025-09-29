const mongoose = require('mongoose');
const { Schema } = mongoose;

const productSchema = new Schema({
  productName: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    required: false,
    trim: true
  },
  category: {
    type: Schema.Types.ObjectId,
    ref: "Category",
    required: true
  },
  isListed: {
  type: Boolean,
  default: true,
},
  quantity: {
    type: Number,
    default: 0, 
    required: true,
    min: 0
  },
  sizes: {
  type: [String],
  default: ["6", "7", "8", "9", "10"]
},
  productImage: {
    type: [String],
    required: true
  },
  isBlocked: {
    type: Boolean,
    default: false
  },
  status: {
    type: String,
    enum: ["Available", "Out of stock"],
    required: true,
    default: "Available"
  },
  isPublished: {
    type: Boolean,
    default: false
  },
  price: {
    type: Number,
    required: true,
    min: 0
  },
  discountPrice: {
     type: Number,
      default: 0 
    },
  isDeleted: {
    type: Boolean,
    default: false
  }
}, { timestamps: true }); 


productSchema.index(
  { productName: 1, color: 1, category: 1 },
  { unique: true }
);

const Product = mongoose.model("Product", productSchema);
module.exports = Product;
