import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { UserService, CreateUserDto, UpdateUserDto } from './user.service';
import { AuthGuard } from '../../common/guards/auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { User } from '../../entities/user.entity';
import { UserRole } from '../../types/user';

@ApiTags('Users')
@Controller('users')
@ApiBearerAuth()
@UseGuards(AuthGuard)
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Post()
  @UseGuards(RolesGuard)
  @Roles('admin', 'super_admin')
  @ApiOperation({ summary: 'Create a new user' })
  @ApiResponse({ status: 201, description: 'User created successfully' })
  @ApiResponse({ status: 409, description: 'Email or username already exists' })
  async createUser(@Body() createUserDto: CreateUserDto): Promise<User> {
    return this.userService.createUser(createUserDto);
  }

  @Get()
  @UseGuards(RolesGuard)
  @Roles('admin', 'super_admin')
  @ApiOperation({ summary: 'Get users list with pagination' })
  @ApiResponse({ status: 200, description: 'Users retrieved successfully' })
  async getUsers(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20,
    @Query('search') search?: string,
  ): Promise<{
    users: User[];
    total: number;
    page: number;
    limit: number;
  }> {
    return this.userService.findUsers(Number(page), Number(limit), search);
  }

  @Get('search')
  @ApiOperation({ summary: 'Search users by name, username, or email' })
  @ApiResponse({ status: 200, description: 'Users found' })
  async searchUsers(
    @Query('q') query: string,
    @Query('limit') limit: number = 10,
  ): Promise<User[]> {
    return this.userService.searchUsers(query, Number(limit));
  }

  @Get('stats/active-count')
  @UseGuards(RolesGuard)
  @Roles('admin', 'super_admin')
  @ApiOperation({ summary: 'Get active user count' })
  @ApiResponse({ status: 200, description: 'Active user count retrieved' })
  async getActiveUserCount(): Promise<{ count: number }> {
    const count = await this.userService.getActiveUserCount();
    return { count };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get user by ID' })
  @ApiResponse({ status: 200, description: 'User retrieved successfully' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async getUserById(@Param('id', ParseUUIDPipe) id: string): Promise<User> {
    return this.userService.findById(id);
  }

  @Get(':id/stats')
  @ApiOperation({ summary: 'Get user statistics' })
  @ApiResponse({ status: 200, description: 'User stats retrieved successfully' })
  async getUserStats(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{
    totalTravels: number;
    totalExpenses: number;
  }> {
    return this.userService.getUserStats(id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update user information' })
  @ApiResponse({ status: 200, description: 'User updated successfully' })
  @ApiResponse({ status: 404, description: 'User not found' })
  @ApiResponse({ status: 409, description: 'Username already exists' })
  async updateUser(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateUserDto: UpdateUserDto,
  ): Promise<User> {
    return this.userService.updateUser(id, updateUserDto);
  }

  @Put(':id/role')
  @UseGuards(RolesGuard)
  @Roles('admin', 'super_admin')
  @ApiOperation({ summary: 'Update user role' })
  @ApiResponse({ status: 200, description: 'User role updated successfully' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async updateUserRole(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() roleDto: { role: UserRole },
  ): Promise<User> {
    return this.userService.updateUserRole(id, roleDto.role);
  }

  @Put(':id/password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Update user password' })
  @ApiResponse({ status: 204, description: 'Password updated successfully' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async updatePassword(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() passwordDto: { password: string },
  ): Promise<void> {
    return this.userService.updatePassword(id, passwordDto.password);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles('admin', 'super_admin')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete user' })
  @ApiResponse({ status: 204, description: 'User deleted successfully' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async deleteUser(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.userService.deleteUser(id);
  }
}