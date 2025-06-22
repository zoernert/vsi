const errorHandler = (err, req, res, next) => {
    console.error(err.stack); // Log the error stack for debugging

    const statusCode = err.statusCode || 500;
    const message = err.message || 'Something went wrong!';

    res.status(statusCode).json({
        success: false,
        message: message,
        // In production, you might not want to send the full error stack
        // stack: process.env.NODE_ENV === 'development' ? err.stack : {}
    });
};

module.exports = errorHandler;
