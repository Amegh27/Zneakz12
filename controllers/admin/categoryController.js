
const Category = require('../../models/categorySchema')



const categoryInfo = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 4;
    const skip = (page - 1) * limit;
    const search = req.query.search ? req.query.search.trim() : '';

    const query = {};

    if (search) {
      query.name = { $regex: search, $options: 'i' }; 
    }

    const categoryData = await Category.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const totalCategories = await Category.countDocuments(query);
    const totalPages = Math.ceil(totalCategories / limit);

    res.render('category', {
      cat: categoryData,
      currentPage: page,
      totalPages,
      totalCategories,
      searchQuery: search 
    });
  } catch (error) {
    console.error("Category Info Error:", error);
    res.redirect('/pageError');
  }
};



const addCategory = async (req, res) => {
  const { name, description } = req.body;
  try {
    const existingCategory = await Category.findOne({
      name: { $regex: new RegExp(`^${name}$`, "i") }
    });

    if (existingCategory) {
      return res.status(400).json({ error: "Category already exists" });
    }

    const newCategory = new Category({
      name: name.trim(),
      description: description?.trim() || ""
    });

    await newCategory.save();
    return res.json({ message: "Category added successfully" });

  } catch (error) {
    console.error("Error adding category:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};



const getListCategory = async (req, res) => {
    try {
        let id = req.query.id;
        await Category.updateOne({ _id: id }, { $set: { isListed: true } });
        res.redirect('/admin/category');
    } catch (error) {
        res.redirect('/pageError');
    }
};

const getUnlistCategory = async (req, res) => {
    try {
        let id = req.query.id;
        await Category.updateOne({ _id: id }, { $set: { isListed: false } });
        res.redirect('/admin/category');
    } catch (error) {
        res.redirect('/pageError');
    }
};

const getEditCategory = async(req,res)=>{
    try {
        const id = req.query.id
   
        
        await Category.updateOne({ _id: id }, { $set: { isListed: false } });
           await Product.updateMany({ category: id }, { $set: { isPublished: false } });

    res.redirect('/admin/category');
    } catch (error) {
        res.redirect('/pageError')
    }
}

const editCategory = async(req,res)=>{
    try {
        const id =req.params.id
        const {categoryName,description} = req.body
        const existingCategory = await Category.findOne({name:categoryName})

        if(existingCategory){
            return res.status(400).json({error:"Category exists,please choose another name"})
        }

        const updateCategory = await Category.findByIdAndUpdate(id,{
            name:categoryName,
            description:description
        },{new:true})

        if(updateCategory){
            res.redirect('/admin/category')
        }else{
            res.status(400).json({error:"Category not found"})
        }


    } catch (error) {
        res.status(500).json({error:"Internal server error"})
    }
}

module.exports = {
    categoryInfo,
    addCategory,
    getListCategory,
    getUnlistCategory,
    getEditCategory,
    editCategory
}