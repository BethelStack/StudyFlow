function errorHandler(err,req,res,next){
    console.log(err);
    const statusCode = err.status || 500;
    if(statusCode === 500){
        return res.status(500).json({message : "internal server error"});
    }
    res.status(statusCode).json({message : err.message || "something went wwrong"});
}
module.exports = errorHandler;