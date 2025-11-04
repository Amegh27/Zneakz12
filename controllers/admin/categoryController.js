
const Category = require('../../models/categorySchema')
const Product = require('../../models/productSchema')
const Offer = require('../../models/offerSchema')


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

       for (const cat of categoryData) {
      const activeOffer = await Offer.findOne({
        category: cat._id,
        offerType: 'category',
        endDate: { $gte: new Date() },
      }).lean();

      if (activeOffer) {
        cat.offer = {
          title: activeOffer.title,
          discountType: activeOffer.discountType,
          discountValue: activeOffer.discountValue,
          startDate: activeOffer.startDate,
          endDate: activeOffer.endDate,
          offerId: activeOffer._id,
        };
      }
    }

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
        await Product.updateMany(
      { category: id },
      { $set: { isListed: true } } 
    );
        res.redirect('/admin/category');
    } catch (error) {
        res.redirect('/pageError');
    }
};

const getUnlistCategory = async (req, res) => {
  try {
    const id = req.query.id;

    await Category.updateOne({ _id: id }, { $set: { isListed: false } });

    await Product.updateMany(
      { category: id },
      { $set: { isListed: false } }  
    );

    res.redirect('/admin/category');
  } catch (error) {
    console.error('Error unlisting category:', error);
    res.redirect('/pageError');
  }
};


const getEditCategory = async (req, res) => {
    try {
        const id = req.params.id;
        if (!id) return res.redirect('/admin/pageError');


        const category = await Category.findById(id);
        if (!category) return res.redirect('/admin/pageError');

        res.render('edit-category', { category }); 
    } catch (error) {
        console.error(error);
        res.redirect('/admin/pageError');
;
    }
};

const editCategory = async (req, res) => {
  try {
    const id = req.params.id.trim();
    const { categoryName, description } = req.body;

    if (!categoryName || !description) {
      return res.status(400).json({ error: "All fields are required." });
    }

    const existingCategory = await Category.findOne({
      name: { $regex: new RegExp(`^${categoryName}$`, "i") },
      _id: { $ne: id }
    });

    if (existingCategory) {
      return res.status(400).json({ error: "Category name already exists." });
    }

    const updatedCategory = await Category.findByIdAndUpdate(
      id,
      {
        name: categoryName.trim(),
        description: description.trim(),
      },
      { new: true }
    );

    if (!updatedCategory) {
      return res.status(404).json({ error: "Category not found." });
    }

    return res.status(200).json({ message: "Category updated successfully!" });

  } catch (error) {
    console.error("Edit category error:", error);
    return res.status(500).json({ error: "Internal server error." });
  }
};




module.exports = {
    categoryInfo,
    addCategory,
    getListCategory,
    getUnlistCategory,
    getEditCategory,
    editCategory
}