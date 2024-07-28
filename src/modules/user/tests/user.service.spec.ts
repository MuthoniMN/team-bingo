import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import UserService from '../user.service';
import { User, UserType } from '../entities/user.entity';
import CreateNewUserOptions from '../options/CreateNewUserOptions';
import UserResponseDTO from '../dto/user-response.dto';
import UserIdentifierOptionsType from '../options/UserIdentifierOptions';
import { BadRequestException, HttpException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { UpdateUserDto } from '../dto/update-user-dto';
import { UserPayload } from '../interfaces/user-payload.interface';
import { DeactivateAccountDto } from '../dto/deactivate-account.dto';

describe('UserService', () => {
  let service: UserService;
  let repository: Repository<User>;

  const mockUserRepository = {
    save: jest.fn(),
    findOne: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserService,
        {
          provide: getRepositoryToken(User),
          useValue: mockUserRepository,
        },
      ],
    }).compile();

    service = module.get<UserService>(UserService);
    repository = module.get<Repository<User>>(getRepositoryToken(User));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createUser', () => {
    it('should create a new user', async () => {
      const createUserDto: CreateNewUserOptions = {
        email: 'test@example.com',
        first_name: 'John',
        last_name: 'Doe',
        password: 'password',
      };

      await service.createUser(createUserDto);
      expect(repository.save).toHaveBeenCalledWith(expect.objectContaining(createUserDto));
    });
  });

  describe('getUserRecord', () => {
    it('should return a user by email', async () => {
      const email = 'test@example.com';
      const userResponseDto: UserResponseDTO = {
        id: 'uuid',
        email: 'test@example.com',
        first_name: 'John',
        last_name: 'Doe',
      };

      mockUserRepository.findOne.mockResolvedValueOnce(userResponseDto);

      const result = await service.getUserRecord({ identifier: email, identifierType: 'email' });
      expect(result).toEqual(userResponseDto);
      expect(repository.findOne).toHaveBeenCalledWith({ where: { email } });
    });

    it('should return a user by id', async () => {
      const id = '1';
      const userResponseDto: UserResponseDTO = {
        id: 'some-uuid-here',
        email: 'test@example.com',
        first_name: 'John',
        last_name: 'Doe',
      };

      mockUserRepository.findOne.mockResolvedValueOnce(userResponseDto);

      const result = await service.getUserRecord({ identifier: id, identifierType: 'id' });
      expect(result).toEqual(userResponseDto);
      expect(repository.findOne).toHaveBeenCalledWith({ where: { id } });
    });

    it('should handle exceptions gracefully', async () => {
      const identifierOptions: UserIdentifierOptionsType = { identifier: 'unknown', identifierType: 'email' };

      mockUserRepository.findOne.mockImplementationOnce(() => {
        throw new Error('Test error');
      });

      await expect(service.getUserRecord(identifierOptions)).rejects.toThrow('Test error');
    });
  });

  describe('updateUser', () => {
    const userId = 'valid-id';
    const updateOptions: UpdateUserDto = {
      first_name: 'Jane',
      last_name: 'Doe',
      phone_number: '1234567890',
    };
    const existingUser = {
      id: userId,
      first_name: 'John',
      last_name: 'Doe',
      phone_number: '0987654321',
      user_type: UserType.USER,
    };
    const updatedUser = { ...existingUser, ...updateOptions };

    const superAdminPayload: UserPayload = {
      id: 'super-admin-id',
      email: 'superadmin@example.com',
      user_type: UserType.SUPER_ADMIN,
    };

    const regularUserPayload: UserPayload = {
      id: userId,
      email: 'user@example.com',
      user_type: UserType.USER,
    };

    const anotherUserPayload: UserPayload = {
      id: 'another-user-id',
      email: 'anotheruser@example.com',
      user_type: UserType.USER,
    };

    it('should allow super admin to update any user', async () => {
      mockUserRepository.findOne.mockResolvedValueOnce(existingUser);
      mockUserRepository.save.mockResolvedValueOnce(updatedUser);

      const result = await service.updateUser(userId, updateOptions, superAdminPayload);

      expect(result).toEqual({
        status: 'success',
        message: 'User Updated Successfully',
        user: {
          id: userId,
          name: 'Jane Doe',
          phone_number: '1234567890',
        },
      });
      expect(mockUserRepository.findOne).toHaveBeenCalledWith({ where: { id: userId } });
      expect(mockUserRepository.save).toHaveBeenCalledWith(updatedUser);
    });

    it('should allow user to update their own details', async () => {
      mockUserRepository.findOne.mockResolvedValueOnce(existingUser);
      mockUserRepository.save.mockResolvedValueOnce(updatedUser);

      const result = await service.updateUser(userId, updateOptions, regularUserPayload);

      expect(result).toEqual({
        status: 'success',
        message: 'User Updated Successfully',
        user: {
          id: userId,
          name: 'Jane Doe',
          phone_number: '1234567890',
        },
      });
      expect(mockUserRepository.findOne).toHaveBeenCalledWith({ where: { id: userId } });
      expect(mockUserRepository.save).toHaveBeenCalledWith(updatedUser);
    });

    it('should throw ForbiddenException when regular user tries to update another user', async () => {
      mockUserRepository.findOne.mockResolvedValueOnce(existingUser);

      await expect(service.updateUser(userId, updateOptions, anotherUserPayload)).rejects.toThrow(ForbiddenException);
      expect(mockUserRepository.findOne).toHaveBeenCalledWith({ where: { id: userId } });
      expect(mockUserRepository.save).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException for invalid userId', async () => {
      const invalidUserId = 'invalid-id';
      mockUserRepository.findOne.mockResolvedValueOnce(null);

      await expect(service.updateUser(invalidUserId, updateOptions, superAdminPayload)).rejects.toThrow(
        NotFoundException
      );
      expect(mockUserRepository.findOne).toHaveBeenCalledWith({ where: { id: invalidUserId } });
    });

    it('should throw BadRequestException for missing userId', async () => {
      const emptyUserId = '';

      await expect(service.updateUser(emptyUserId, updateOptions, superAdminPayload)).rejects.toThrow(
        BadRequestException
      );
    });

    it('should throw BadRequestException for invalid request body', async () => {
      const invalidUpdateOptions = { first_name: 123 } as unknown as UpdateUserDto;
      mockUserRepository.findOne.mockResolvedValueOnce(existingUser);
      mockUserRepository.save.mockRejectedValueOnce(new Error('Invalid field'));

      await expect(service.updateUser(userId, invalidUpdateOptions, superAdminPayload)).rejects.toThrow(
        BadRequestException
      );
      expect(mockUserRepository.findOne).toHaveBeenCalledWith({ where: { id: userId } });
      expect(mockUserRepository.save).toHaveBeenCalled();
    });
  });

  describe('deactivateUser', () => {
    it('should deactivate a user', async () => {
      const userId = '1';
      const deactivationDetails: DeactivateAccountDto = {
        confirmation: true,
        reason: 'User requested deactivation',
      };
      const userToUpdate = {
        id: '1',
        first_name: 'John',
        last_name: 'Doe',
        email: 'test@example.com',
        password: 'hashedpassword',
        is_active: true,
        attempts_left: 3,
        time_left: 60,
      };

      mockUserRepository.findOne.mockResolvedValueOnce(userToUpdate);

      const result = await service.deactivateUser(userId, deactivationDetails);

      expect(result.is_active).toBe(false);
      expect(result.message).toBe('Account Deactivated Successfully');
      expect(mockUserRepository.findOne).toHaveBeenCalledWith({ where: { id: userId } });
      expect(mockUserRepository.save).toHaveBeenCalledWith({ ...userToUpdate, is_active: false });
    });

    it('should throw an error if user is not found', async () => {
      const userId = '1';
      const deactivationDetails: DeactivateAccountDto = {
        confirmation: true,
        reason: 'User requested deactivation',
      };

      mockUserRepository.findOne.mockResolvedValueOnce(null);

      await expect(service.deactivateUser(userId, deactivationDetails)).rejects.toThrow(HttpException);
      await expect(service.deactivateUser(userId, deactivationDetails)).rejects.toHaveProperty('response', {
        status_code: 404,
        error: 'User not found',
      });
      expect(mockUserRepository.findOne).toHaveBeenCalledWith({ where: { id: userId } });
      expect(mockUserRepository.save).not.toHaveBeenCalled();
    });
  });

  describe('getUserByDataByIdWithoutPassword', () => {
    const userId = 'valid-id';
    const userWithoutPassword = {
      id: userId,
      first_name: 'John',
      last_name: 'Doe',
      email: 'test@example.com',
      is_active: true,
    };

    it('should return user data without password', async () => {
      mockUserRepository.findOne.mockResolvedValueOnce({ password: 'hashedpassword', ...userWithoutPassword });

      const result = await service.getUserDataWithoutPasswordById(userId);

      expect(result.user).toEqual(userWithoutPassword);
      expect(result.user).not.toHaveProperty('password');
      expect(mockUserRepository.findOne).toHaveBeenCalledWith({
        where: { id: userId },
      });
    });
  });
});