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

    const query = req.query.q ? req.query.q.trim() : "";
    const sort = req.query.sort || "";
    const priceRange = req.query.priceRange || "";

    let filter = { category: menCategory._id };

    if (query) {
      filter.productName = { $regex: query, $options: "i" }; 
    }

    if (priceRange) {
      const [min, max] = priceRange.split("-").map(Number);
      if (!isNaN(min) && !isNaN(max)) {
        filter.price = { $gte: min, $lte: max };
      }
    }

    let sortOption = {};
    if (sort === "priceAsc") sortOption = { effectivePrice: 1 };
    else if (sort === "priceDesc") sortOption = { effectivePrice: -1 };
    else if (sort === "nameAsc") sortOption.productName = 1;
    else if (sort === "nameDesc") sortOption.productName = -1;

   const products = await Product.aggregate([
  { $match: filter },
  { $addFields: { effectivePrice: { $ifNull: ["$discountPrice", "$price"] } } },
  { $sort: sort === 'priceAsc' ? { effectivePrice: 1 } :
           sort === 'priceDesc' ? { effectivePrice: -1 } : { productName: 1 } },
  { $skip: (page - 1) * perPage },
  { $limit: perPage }
]);


    const totalProducts = await Product.countDocuments(filter);
    const totalPages = Math.ceil(totalProducts / perPage);
    const categories = await Category.find({ isListed: true });

    res.render("men", {
      user: req.session.user ? await User.findById(req.session.user) : null,
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
    console.error(err);
    res.status(500).send("Server Error");
  }
};



const getWomenProducts = async (req, res) => {
  try {
    const womenCategory = await Category.findOne({ name: 'Women' });
    if (!womenCategory) return res.send('Women category not found');

    const perPage = 3;
    const page = parseInt(req.query.page) || 1;

    const query = req.query.q ? req.query.q.trim() : '';
    const sort = req.query.sort || '';
    const priceRange = req.query.priceRange || '';

    let filter = { category: womenCategory._id, isListed: true };

    if (query) {
      filter.productName = { $regex: query, $options: 'i' };
    }

    if (priceRange) {
      const [min, max] = priceRange.split('-').map(Number);
      if (!isNaN(min) && !isNaN(max)) filter.price = { $gte: min, $lte: max };
    }

    // Default sort if none selected
    let sortStage = { productName: 1 };

    if (sort === 'priceAsc') sortStage = { effectivePrice: 1 };
    else if (sort === 'priceDesc') sortStage = { effectivePrice: -1 };
    else if (sort === 'nameAsc') sortStage = { productName: 1 };
    else if (sort === 'nameDesc') sortStage = { productName: -1 };

    const products = await Product.aggregate([
      { $match: filter },
      { $addFields: { effectivePrice: { $ifNull: ['$discountPrice', '$price'] } } },
      { $sort: sortStage },
      { $skip: (page - 1) * perPage },
      { $limit: perPage },
    ]);

    const totalProducts = await Product.countDocuments(filter);
    const totalPages = Math.ceil(totalProducts / perPage);
    const categories = await Category.find({ isListed: true });

    res.render('women', {
      user: req.session.user ? await User.findById(req.session.user) : null,
      products,
      currentPage: page,
      totalPages,
      query,
      sort,
      categories,
      selectedCategory: ['Women'],
      priceRange
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
};




const getKidsProducts = async (req, res) => {
  try {
    const kidsCategory = await Category.findOne({ name: "Kids" });
    if (!kidsCategory) return res.send("Kids category not found");

    const perPage = 3;
    const page = parseInt(req.query.page) || 1;

    const query = req.query.q ? req.query.q.trim() : "";
    const sort = req.query.sort || "";
    const priceRange = req.query.priceRange || "";

    let filter = { category: kidsCategory._id, isListed: true };

    if (query) {
      filter.productName = { $regex: query, $options: "i" };
    }

    if (priceRange) {
      const [min, max] = priceRange.split("-").map(Number);
      if (!isNaN(min) && !isNaN(max)) filter.price = { $gte: min, $lte: max };
    }

    let sortOption = {};
    if (sort === "priceAsc") sortOption = { effectivePrice: 1 };
    else if (sort === "priceDesc") sortOption = { effectivePrice: -1 };
    else if (sort === "nameAsc") sortOption = { productName: 1 };
    else if (sort === "nameDesc") sortOption = { productName: -1 };

    const products = await Product.aggregate([
      { $match: filter },
      { $addFields: { effectivePrice: { $ifNull: ["$discountPrice", "$price"] } } },
      { $sort:
        sort === "priceAsc" ? { effectivePrice: 1 } :
        sort === "priceDesc" ? { effectivePrice: -1 } :
        sort === "nameDesc" ? { productName: -1 } :
        { productName: 1 }
      },
      { $skip: (page - 1) * perPage },
      { $limit: perPage }
    ]);

    const totalProducts = await Product.countDocuments(filter);
    const totalPages = Math.ceil(totalProducts / perPage);
    const categories = await Category.find({ isListed: true });

    res.render("kids", {
      user: req.session.user ? await User.findById(req.session.user) : null,
      products,
      currentPage: page,
      totalPages,
      query,
      sort,
      categories,
      selectedCategory: ["Kids"],
      priceRange,
    });

  } catch (err) {
    console.error(err);
    res.status(500).send("Server Error");
  }
};

module.exports = { getKidsProducts };




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