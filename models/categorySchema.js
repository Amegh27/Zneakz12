const mongoose = require('mongoose')
const {Schema} = mongoose

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
