const BaseController = require('./BaseController');

class UserController extends BaseController {
  constructor(userService) {
    super();
    this.userService = userService;
  }

  register = this.asyncHandler(async (req, res) => {
    const user = await this.userService.registerUser(req.body);
    this.sendSuccessResponse(res, user, 'User registered successfully', 201);
  });

  login = this.asyncHandler(async (req, res) => {
    const { username, password } = req.body;
    const result = await this.userService.authenticateUser(username, password);
    this.sendSuccessResponse(res, result, 'Login successful');
  });

  getProfile = this.asyncHandler(async (req, res) => {
    const userId = req.user.userId;
    const profile = await this.userService.getUserProfile(userId);
    this.sendSuccessResponse(res, profile, 'Profile retrieved successfully');
  });

  updateProfile = this.asyncHandler(async (req, res) => {
    const userId = req.user.userId;
    const updatedUser = await this.userService.updateUserProfile(userId, req.body);
    this.sendSuccessResponse(res, updatedUser, 'Profile updated successfully');
  });

  changePassword = this.asyncHandler(async (req, res) => {
    const userId = req.user.userId;
    const { currentPassword, newPassword } = req.body;
    const result = await this.userService.changePassword(userId, currentPassword, newPassword);
    this.sendSuccessResponse(res, result, 'Password changed successfully');
  });

  deleteAccount = this.asyncHandler(async (req, res) => {
    const userId = req.user.userId;
    const result = await this.userService.deleteUser(userId);
    this.sendSuccessResponse(res, result, 'Account deleted successfully');
  });

  // Admin only routes
  getActiveUsers = this.asyncHandler(async (req, res) => {
    const days = parseInt(req.query.days) || 30;
    const users = await this.userService.getActiveUsers(days);
    this.sendSuccessResponse(res, users, `Active users in last ${days} days`);
  });
}

module.exports = UserController;
