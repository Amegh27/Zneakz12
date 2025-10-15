const Product = require('../../models/productSchema')
const Category = require('../../models/categorySchema')
const User = require('../../models/userSchema')


const searchProducts = async (req, res) => {
  try {
    const query=req.query.q?.trim() || '';
    const page=parseInt(req.query.page) || 1;
    const limit=4;
    const skip=(page-1) * limit;
    const sortOption=req.query.sort || '';

    let sortCriteria={};

    
    switch (sortOption) {
      case 'priceAsc':
        sortCriteria = { price: 1 };
        break;
      case 'priceDesc':
        sortCriteria = { price: -1 };
        break;
      case 'nameAsc':
        sortCriteria = { productName: 1 };
        break;
      case 'nameDesc':
        sortCriteria = { productName: -1 };
        break;
      default:
        sortCriteria = {}; 
    }

    let filter={};
    if (query) {
      filter = { productName: { $regex: query, $options: 'i' } };
    }

    const totalProducts = await Product.countDocuments(filter);
    const products = await Product.find(filter)
      .sort(sortCriteria)
      .skip(skip)
      .limit(limit);

    const totalPages = Math.ceil(totalProducts / limit);

    res.render('home', {
      products,
      query,
      currentPage: page,
      totalPages,
      sort: sortOption
    });
  } catch (error) {
    console.error("Search Error:", error);
    res.redirect('/pageNotFound');
  }
};


const productDetails = async (req, res) => {
  try {
    const userId = req.session.user;
    const userdata = await User.findById(userId);
    const productId = req.query.id;

    const product = await Product.findById(productId).populate('category');

    if (!product || product.isDeleted || !product.isListed || product.isBlocked) {
      return res.redirect('/');
    }

    let relatedProducts = [];

    if (product.category && product.category._id) {
      relatedProducts = await Product.find({
        category: product.category._id,
        _id: { $ne: product._id },
        isDeleted: false,
        isListed: true,
      }).limit(4);
    }

    if (relatedProducts.length === 0) {
      relatedProducts = await Product.find({
        _id: { $ne: product._id },
        isDeleted: false,
        isListed: true,
      }).limit(4);
    }

    res.render("product-details", {
      user: userdata,
      product,
      quantity: product.quantity,
      category: product.category,
      relatedProducts,
    });
  } catch (error) {
    console.error("Error fetching product details:", error);
    res.redirect("/pageNotFound");
  }
};






const getMenProducts = async (req, res) => {
  try {
    const menCategory = await Category.findOne({ name: "Men" });
    if (!menCategory) return res.send("Men category not found");

    const perPage = 3;
    const page = parseInt(req.query.page) || 1;
    const skip = (page - 1) * perPage;

    const query = req.query.q ? req.query.q.trim() : "";
    const sort = req.query.sort || "";
    const priceRange = req.query.priceRange || "";

    let matchStage = {
      category: menCategory._id,
      isBlocked: false,
      quantity: { $gt: 0 }
    };

    if (query) {
      matchStage.productName = { $regex: query, $options: "i" };
    }

    let pipeline = [
      { $match: matchStage },
      {
        $addFields: {
          effectivePrice: { $ifNull: ["$discountPrice", "$price"] }
        }
      }
    ];

    if (priceRange) {
      const [min, max] = priceRange.split("-").map(Number);
      if (!isNaN(min) && !isNaN(max)) {
        pipeline.push({
          $match: { effectivePrice: { $gte: min, $lte: max } }
        });
      }
    }

    if (sort === "priceAsc") pipeline.push({ $sort: { effectivePrice: 1 } });
    else if (sort === "priceDesc") pipeline.push({ $sort: { effectivePrice: -1 } });
    else if (sort === "nameAsc") pipeline.push({ $sort: { productName: 1 } });
    else if (sort === "nameDesc") pipeline.push({ $sort: { productName: -1 } });
    else pipeline.push({ $sort: { createdAt: -1 } }); 

    pipeline.push({ $skip: skip });
    pipeline.push({ $limit: perPage });

    const products = await Product.aggregate(pipeline);

    let countPipeline = [
      { $match: matchStage },
      {
        $addFields: {
          effectivePrice: { $ifNull: ["$discountPrice", "$price"] }
        }
      }
    ];
    if (priceRange) {
      const [min, max] = priceRange.split("-").map(Number);
      if (!isNaN(min) && !isNaN(max)) {
        countPipeline.push({
          $match: { effectivePrice: { $gte: min, $lte: max } }
        });
      }
    }
    countPipeline.push({ $count: "total" });

    const countResult = await Product.aggregate(countPipeline);
    const totalProducts = countResult[0] ? countResult[0].total : 0;
    const totalPages = Math.ceil(totalProducts / perPage);

    const categories = await Category.find({ isListed: true });

    const userData = req.session.user ? await User.findById(req.session.user) : null;

    res.render("men", {
      user: userData,
      products,
      currentPage: page,
      totalPages,
      query,
      sort,
      categories,
      selectedCategory: ["Men"],
      priceRange,
    });

  } catch (err) {
    console.error("Error loading Men products:", err);
    res.status(500).send("Server Error");
  }
};




const getWomenProducts = async (req, res) => {
  try {
    const womenCategory = await Category.findOne({ name: "Women" });
    if (!womenCategory) return res.send("Women category not found");

    const perPage = 3;
    const page = parseInt(req.query.page) || 1;
    const skip = (page - 1) * perPage;

    const query = req.query.q ? req.query.q.trim() : "";
    const sort = req.query.sort || "";
    const priceRange = req.query.priceRange || "";

    let matchStage = {
      category: womenCategory._id,
      isBlocked: false,
      quantity: { $gt: 0 }
    };

    if (query) {
      matchStage.productName = { $regex: query, $options: "i" };
    }

    let pipeline = [
      { $match: matchStage },
      { $addFields: { effectivePrice: { $ifNull: ["$discountPrice", "$price"] } } }
    ];

    if (priceRange) {
      const [min, max] = priceRange.split("-").map(Number);
      if (!isNaN(min) && !isNaN(max)) {
        pipeline.push({ $match: { effectivePrice: { $gte: min, $lte: max } } });
      }
    }

    if (sort === "priceAsc") pipeline.push({ $sort: { effectivePrice: 1 } });
    else if (sort === "priceDesc") pipeline.push({ $sort: { effectivePrice: -1 } });
    else if (sort === "nameAsc") pipeline.push({ $sort: { productName: 1 } });
    else if (sort === "nameDesc") pipeline.push({ $sort: { productName: -1 } });
    else pipeline.push({ $sort: { createdAt: -1 } });

    pipeline.push({ $skip: skip }, { $limit: perPage });

    const products = await Product.aggregate(pipeline);

    let countPipeline = [
      { $match: matchStage },
      { $addFields: { effectivePrice: { $ifNull: ["$discountPrice", "$price"] } } }
    ];
    if (priceRange) {
      const [min, max] = priceRange.split("-").map(Number);
      if (!isNaN(min) && !isNaN(max)) {
        countPipeline.push({ $match: { effectivePrice: { $gte: min, $lte: max } } });
      }
    }
    countPipeline.push({ $count: "total" });

    const countResult = await Product.aggregate(countPipeline);
    const totalProducts = countResult[0] ? countResult[0].total : 0;
    const totalPages = Math.ceil(totalProducts / perPage);

    const categories = await Category.find({ isListed: true });
    const userData = req.session.user ? await User.findById(req.session.user) : null;

    res.render("women", {
      user: userData,
      products,
      currentPage: page,
      totalPages,
      query,
      sort,
      categories,
      selectedCategory: ["Women"],
      priceRange
    });

  } catch (err) {
    console.error("Error loading Women products:", err);
    res.status(500).send("Server Error");
  }
};




const getKidsProducts = async (req, res) => {
  try {
    const kidsCategory = await Category.findOne({ name: "Kids" });
    if (!kidsCategory) return res.send("Kids category not found");

    const perPage = 3;
    const page = parseInt(req.query.page) || 1;
    const skip = (page - 1) * perPage;

    const query = req.query.q ? req.query.q.trim() : "";
    const sort = req.query.sort || "";
    const priceRange = req.query.priceRange || "";

    let matchStage = {
      category: kidsCategory._id,
      isBlocked: false,
      quantity: { $gt: 0 }
    };

    if (query) {
      matchStage.productName = { $regex: query, $options: "i" };
    }

    let pipeline = [
      { $match: matchStage },
      { $addFields: { effectivePrice: { $ifNull: ["$discountPrice", "$price"] } } }
    ];

    if (priceRange) {
      const [min, max] = priceRange.split("-").map(Number);
      if (!isNaN(min) && !isNaN(max)) {
        pipeline.push({ $match: { effectivePrice: { $gte: min, $lte: max } } });
      }
    }

    if (sort === "priceAsc") pipeline.push({ $sort: { effectivePrice: 1 } });
    else if (sort === "priceDesc") pipeline.push({ $sort: { effectivePrice: -1 } });
    else if (sort === "nameAsc") pipeline.push({ $sort: { productName: 1 } });
    else if (sort === "nameDesc") pipeline.push({ $sort: { productName: -1 } });
    else pipeline.push({ $sort: { createdAt: -1 } });

    pipeline.push({ $skip: skip }, { $limit: perPage });

    const products = await Product.aggregate(pipeline);

    let countPipeline = [
      { $match: matchStage },
      { $addFields: { effectivePrice: { $ifNull: ["$discountPrice", "$price"] } } }
    ];
    if (priceRange) {
      const [min, max] = priceRange.split("-").map(Number);
      if (!isNaN(min) && !isNaN(max)) {
        countPipeline.push({ $match: { effectivePrice: { $gte: min, $lte: max } } });
      }
    }
    countPipeline.push({ $count: "total" });

    const countResult = await Product.aggregate(countPipeline);
    const totalProducts = countResult[0] ? countResult[0].total : 0;
    const totalPages = Math.ceil(totalProducts / perPage);

    const categories = await Category.find({ isListed: true });
    const userData = req.session.user ? await User.findById(req.session.user) : null;

    res.render("kids", {
      user: userData,
      products,
      currentPage: page,
      totalPages,
      query,
      sort,
      categories,
      selectedCategory: ["Kids"],
      priceRange
    });

  } catch (err) {
    console.error("Error loading Kids products:", err);
    res.status(500).send("Server Error");
  }
};





const menDetails = async (req, res) => {
  try {
    const userId = req.session.user;
    const userdata = await User.findById(userId);
    const productId = req.query.id;

    const product = await Product.findById(productId).populate('category');

    if (!product || product.isDeleted || !product.isListed || product.isBlocked) {
      return res.redirect('/');
    }

    const minPrice = product.price - 1000;
    const maxPrice = product.price + 1000;

    const relatedProducts = await Product.find({
      category: product.category._id,
      _id: { $ne: product._id },
      isDeleted: false,
      isListed: true,
      price: { $gte: minPrice, $lte: maxPrice }
    }).limit(4);

    
    res.render("men-details", {
      user: userdata,
      product,
      quantity: product.quantity,
      category: product.category,
      relatedProducts,
    });
  } catch (error) {
    console.error("Error fetching product details:", error);
    res.redirect("/pageNotFound");
  }
};



const womenDetails = async (req, res) => {
  try {
    const userId = req.session.user;
    const userdata = await User.findById(userId);
    const productId = req.query.id;

    const product = await Product.findById(productId).populate('category');

    if (!product || product.isDeleted || !product.isListed || product.isBlocked) {
      return res.redirect('/');
    }

    const minPrice = product.price - 1000;
    const maxPrice = product.price + 1000;

    const relatedProducts = await Product.find({
      category: product.category._id,
      _id: { $ne: product._id },
      isDeleted: false,
      isListed: true,
      price: { $gte: minPrice, $lte: maxPrice }
    }).limit(4);

    res.render("women-details", {
      user: userdata,
      product,
      quantity: product.quantity,
      category: product.category,
      relatedProducts,
    });
  } catch (error) {
    console.error("Error fetching women product details:", error);
    res.redirect("/pageNotFound");
  }
};



const kidsDetails = async (req, res) => {
  try {
    const userId = req.session.user;
    const userdata = await User.findById(userId);
    const productId = req.query.id;

    const product = await Product.findById(productId).populate('category');

    if (!product || product.isDeleted || !product.isListed || product.isBlocked) {
      return res.redirect('/');
    }

    const minPrice = product.price - 1000;
    const maxPrice = product.price + 1000;

    const relatedProducts = await Product.find({
      category: product.category._id,
      _id: { $ne: product._id },
      isDeleted: false,
      isListed: true,
      price: { $gte: minPrice, $lte: maxPrice }
    }).limit(4);

    res.render("kids-details", {
      user: userdata,
      product,
      quantity: product.quantity,
      category: product.category,
      relatedProducts,
      reviews:[]
    });
  } catch (error) {
    console.error("Error fetching product details:", error);
    res.redirect("/pageNotFound");
  }
};



module.exports={
    productDetails,
    searchProducts,
    getMenProducts,
    getWomenProducts,
    getKidsProducts,
    menDetails,
    womenDetails,
    kidsDetails
}