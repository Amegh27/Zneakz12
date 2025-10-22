const Product = require('../../models/productSchema')
const Category = require('../../models/categorySchema')
const User = require('../../models/userSchema')
const fs = require('fs')
const path = require('path')
const sharp = require('sharp')


const getProductAddpage = async (req, res) => {
  try {
    const category = await Category.find({ isListed: true })
    res.render('product-add', {
      cat: category
    })
  } catch (error) {
    console.error('Error rendering add-product page:', error)
    res.redirect('/pageError')
  }
}

const addProducts = async (req, res) => {
  try {
    const products = req.body;
    const isPublished = req.body.isPublished === 'on';
    const categoryId = await Category.findOne({ name: products.category });

    if (!categoryId) {
      return res.status(400).json({ error: 'Invalid category name' });
    }

    const productExists = await Product.findOne({
      productName: products.productName.trim(),
      category: categoryId._id
    });

    if (productExists) {
      return res.status(400).json({ error: 'Product already exists' });
    }

    const images = [];
    if (req.files && req.files.length > 0) {
      const imageOutputDir = path.join(__dirname, '../public/uploads/products');
      if (!fs.existsSync(imageOutputDir)) {
        fs.mkdirSync(imageOutputDir, { recursive: true });
      }

      for (let i = 0; i < req.files.length; i++) {
        const originalImagePath = req.files[i].path;
        const resizedImagepath = path.join(imageOutputDir, req.files[i].filename);
        await sharp(originalImagePath)
          .resize({ width: 450, height: 450 })
          .toFile(resizedImagepath);
        images.push(req.files[i].filename);
      }
    }
const sizesInput = products.sizes || [];
const sizes = sizesInput.map(s => ({
  size: s.size,
  stock: parseInt(s.stock, 10) || 0
}));

const totalQuantity = sizes.reduce((acc, s) => acc + s.stock, 0);

const newProduct = new Product({
  productName: products.productName,
  description: products.description,
  quantity: totalQuantity,  // ← update here
  category: categoryId._id,
  productImage: images,
  price: products.price,
  discountPrice: products.discountPrice || products.price,
  sizes,                     // ← include sizes
  status: 'Available',
  isPublished
});


    await newProduct.save();

    return res.status(200).json({ message: 'Product added successfully!' });
  } catch (error) {
    console.error('Error saving product:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};



const getAllProducts = async (req, res) => {
  try {
    const searchQuery = req.query.search || ""; // <-- store search query
    const page = parseInt(req.query.page) || 1;
    const limit = 7;

    const productData = await Product.find({
      isDeleted: { $ne: true },
      $or: [
        { productName: { $regex: new RegExp(".*" + searchQuery + ".*", "i") } }
      ]
    })
      .limit(limit)
      .skip((page - 1) * limit)
      .populate('category')
      .exec();

    const count = await Product.countDocuments({
      isDeleted: { $ne: true },
      $or: [
        { productName: { $regex: new RegExp(".*" + searchQuery + ".*", "i") } }
      ]
    });

    const category = await Category.find({ isListed: true });

    if (category) {
      res.render('products', {
        data: productData,
        currentPage: page,
        totalPages: Math.ceil(count / limit),
        cat: category,
        searchQuery // <-- pass it here
      });
    } else {
      res.render("page-404");
    }
  } catch (error) {
    console.error(error);
    res.redirect('/pageError');
  }
};


const blockProduct = async (req, res) => {
  try {
    let id = req.query.id
    await Product.updateOne({ _id: id }, { $set: { isBlocked: true } })
    res.redirect('/admin/products')
  } catch (error) {
    res.redirect('/pageError')
  }
}

const unblockProduct = async (req, res) => {
  try {
    let id = req.query.id
    await Product.updateOne({ _id: id }, { $set: { isBlocked: false } })
    res.redirect('/admin/products')
  } catch (error) {
    res.redirect('/pageError')
  }
}

const getEditProduct = async (req, res) => {
  try {
    const id = req.query.id
    const product = await Product.findOne({ _id: id })
    const category = await Category.find({})
    res.render('edit-product', {
      product: product,
      cat: category
    })
  } catch (error) {
    res.redirect('/pageError')
  }
}

const editProduct = async (req, res) => {
  try {
    const id = req.params.id;
    const data = req.body;

    const product = await Product.findById(id);
    if (!product) {
      return res.status(404).send('Product not found');
    }

    // Check duplicate product name
    const existingProduct = await Product.findOne({
      productName: data.productName.trim(),
      _id: { $ne: id },
    });
    if (existingProduct) {
      return res.status(400).json({
        error: 'Product with this name already exists. Please try with another name',
      });
    }

    // Handle new uploaded images
    let newImages = [];
    if (req.files && req.files.length > 0) {
      const imageOutputDir = path.join(__dirname, '../../public/uploads/products');
      if (!fs.existsSync(imageOutputDir)) {
        fs.mkdirSync(imageOutputDir, { recursive: true });
      }

      for (let i = 0; i < req.files.length; i++) {
        const originalImagePath = req.files[i].path;
        const resizedImagePath = path.join(imageOutputDir, req.files[i].filename);
        await sharp(originalImagePath).resize(450, 450).toFile(resizedImagePath);
        newImages.push(req.files[i].filename);
      }
    }

    // Process sizes 6–10 and calculate total quantity
   // ✅ Handle sizes from form inputs (e.g. size[] and stock[])
let sizes = [];
let totalQuantity = 0;

if (data.size && data.stock) {
  const sizeArray = Array.isArray(data.size) ? data.size : [data.size];
  const stockArray = Array.isArray(data.stock) ? data.stock : [data.stock];

  sizes = sizeArray.map((s, i) => {
    const stock = parseInt(stockArray[i], 10) || 0;
    totalQuantity += stock;
    return { size: s, stock };
  });
}


    // Prepare fields to update
    const updateFields = {
      productName: data.productName.trim(),
      description: data.description,
      quantity: totalQuantity, // total stock calculated
      price: parseFloat(data.price) || 0,
      discountPrice: parseFloat(data.discountPrice) || parseFloat(data.price) || 0,
      sizes, // updated sizes
    };

    // Handle category
    if (data.category) {
      const categoryDoc = await Category.findOne({ name: data.category });
      if (!categoryDoc) {
        return res.status(400).json({ error: 'Invalid category selected' });
      }
      updateFields.category = categoryDoc._id;
    }

    // Merge new images
    if (newImages.length > 0) {
      updateFields.productImage = [...product.productImage, ...newImages];
    }

    // Update the product
    await Product.findByIdAndUpdate(id, updateFields, { new: true });

    res.redirect('/admin/products');
  } catch (error) {
    console.error(error);
    res.status(500).send('Error: ' + error.message);
  }
};


const deleteSingleImage = async (req, res) => {
  try {
    const { imageNameToServer, productIdToServer } = req.body;

    const product = await Product.findById(productIdToServer);
    if (!product) return res.send({ status: false, message: 'Product not found' });

    // Remove from DB
    await Product.findByIdAndUpdate(productIdToServer, { $pull: { productImage: imageNameToServer } });

    // Remove file from disk
    const imagePath = path.join(__dirname, '../../public/uploads/products', imageNameToServer);
    if (fs.existsSync(imagePath)) {
      fs.unlinkSync(imagePath);
      console.log(`Image ${imageNameToServer} deleted successfully`);
    } else {
      console.log(`Image ${imageNameToServer} not found`);
    }

    res.send({ status: true });
  } catch (error) {
    console.error(error);
    res.redirect('/pageError');
  }
};
const softDeleteProduct = async (req, res) => {
  const { id } = req.params;
  await Product.findByIdAndUpdate(id, { isDeleted: true });
  res.redirect('/products');
};



module.exports = {
  getProductAddpage,
  addProducts,
  getAllProducts,
  blockProduct,
  unblockProduct,
  getEditProduct,
  editProduct,
  deleteSingleImage,
  softDeleteProduct
}