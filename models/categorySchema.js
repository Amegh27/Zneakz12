const mongoose = require('mongoose')
const {Schema} = mongoose


const offerSchema = new Schema({
  title: { 
    type: String, required: true 
},
  discountType: { 
    type: String, enum: ["percentage", "flat"], required: true 
},
  discountValue: { 
    type: Number, required: true 
},
  startDate: { type: Date, 
    required: true },
  endDate: { type: Date, required: true 

  },
  createdAt: { 
    type: Date, default: Date.now 
}
});

const categorySchema ={
    name:{
        type:String,
         required:true,
        default:true,
    },
     description: {
         type: String, default: "" 
        },
    isListed:{
        type:Boolean,
        default:true
    }
}

const Category = mongoose.model("Category",categorySchema)
module.exports = Category
