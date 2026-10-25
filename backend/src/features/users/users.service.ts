import type { RegisterUserRequest, UserResponse } from '@airremote/contracts';
import { AppError } from '../../shared/errors';
import { hashPassword } from './users.helpers';
import type { UsersRepository } from './users.repository';

export type UsersService = {
  register(input: RegisterUserRequest): Promise<UserResponse>;
};

export function createUsersService({
  repository,
}: {
  repository: UsersRepository;
}): UsersService {
  return {
    async register({ email, firstName, lastName, password }) {
      const { hash, salt } = await hashPassword(password);
      const user = await repository.create({
        email: email.trim().toLowerCase(),
        firstName,
        lastName,
        passwordHash: hash,
        passwordSalt: salt,
      });
      if (!user) {
        throw new AppError(409, 'Email is already registered');
      }
      return {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        createdAt: user.createdAt.toISOString(),
      };
    },
  };
}
