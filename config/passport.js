const passport = require('passport')
const GoogleStrategy = require('passport-google-oauth20').Strategy
const User = require('../models/userSchema')
const env = require('dotenv').config()
console.log(process.env.GOOGLE_CALLBACK_URL)


passport.use(new GoogleStrategy({
    clientID:process.env.GOOGLE_CLIENT_ID,
    clientSecret:process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK_URL

},
    async (accessToken, refreshToken, profile, done) => {
    try {
        let user = await User.findOne({googleId: profile.id});
        if(user) {
            return done(null, user);
        } else {
            
            const email = profile.emails && profile.emails.length > 0 
                ? profile.emails[0].value 
                : '';
                
            user = new User({
                name: profile.displayName,
                email: email,
                googleId: profile.id
            });
            await user.save();
            return done(null, user);
        }
    } catch (err) {
        return done(err, null);
    }
}));

passport.serializeUser((user, done) => {
    done(null, user.id);
});

passport.deserializeUser((id, done) => {
    User.findById(id)
    .then(user => {
        done(null, user);
    })
    .catch(err => {
        done(err, null);
    });
});

module.exports=passport;