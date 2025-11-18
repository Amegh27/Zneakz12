const User = require('../../models/userSchema');
const  { destroyUserSessions } = require('../../helpers/sessionHelper')
const mongoose = require("mongoose");

const customerInfo = async (req, res) => {
  try {
    let search = '';
    if (req.query.search) {
      search = req.query.search;
    }

    let page = 1;
    if (req.query.page) {
      page = parseInt(req.query.page); 
    }

    const limit = 5;

    const userData = await User.find({
      isAdmin: false,
      $or: [
        { name: { $regex: ".*" + search + ".*", $options: "i" } },
        { email: { $regex: ".*" + search + ".*", $options: "i" } }
      ]
    })
      .limit(limit)
      .skip((page - 1) * limit)
      .exec()
      
    const count = await User.countDocuments({
      isAdmin: false,
      $or: [
        { name: { $regex: ".*" + search + ".*", $options: "i" } },
        { email: { $regex: ".*" + search + ".*", $options: "i" } }
      ]
    });

    const totalPages = Math.ceil(count / limit);

    res.render('customers', {
      users: userData,
      totalPages,
      currentPage: page,
      searchQuery: search
    });

  } catch (error) {
    console.error("Customer Info Error:", error);
    res.status(500).render("admin/error", { message: "Failed to load customers" });
  }
};


const customerBlocked = async (req, res) => {
  try {
    const id = req.query.id;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.redirect("/admin/users");
    }

    await User.updateOne({ _id: id }, { $set: { isBlocked: true } });

    const store = req.sessionStore;
    if (store) {
      await destroyUserSessions(id, store); 
      console.log(`All sessions destroyed for blocked user: ${id}`);
    }

    return res.redirect("/admin/users");

  } catch (error) {
    console.error("Error blocking user:", error);
    return res.redirect("/pageError");
  }
};

const customerunBlocked = async(req,res)=>{
    try {
        let id = req.query.id
        await User.updateOne({_id:id},{$set:{isBlocked:false}})
        res.redirect('/admin/users')
    } catch (error) {
        res.redirect('/pageError')
    }
}


module.exports = {
  customerInfo,
  customerBlocked,
  customerunBlocked
};
