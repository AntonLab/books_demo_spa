import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verifyPassword } from '../password.ts';
import { ConflictError } from '../types/errors.ts';
import type { CreateUserInput } from '../types/user.ts';
import type { UserRepository } from './userRepository.ts';

// An id no row in either implementation has.
const MISSING_ID = 999_999;

// A user repository reaches no other table the controllers read, so a world is
// the repository alone: every row a case needs, it creates through it.
export interface UserRepositoryContractWorld {
  repository: UserRepository;
}

// Registers the cases every UserRepository must pass, each against a world
// `setUp` builds afresh. Called from userRepository.spec.ts against MySQL and
// from userRepository.fake.spec.ts against the fake the route specs use.
//
// Only what the controllers rely on belongs here: which calls answer null or
// false, which field a conflict names, that no answer but the two credential
// reads carries the hash, and that the hash they carry verifies. Sessions ended
// by a block or a password change, what deleting an account takes with it,
// and the search matching are the real repository's alone, covered in its own
// spec.
export function userRepositoryContract(
  setUp: () => Promise<UserRepositoryContractWorld>
): void {
  const input = (login: string): CreateUserInput => ({
    login,
    email: `${login.toLowerCase()}@example.com`,
    password: 'contract-password',
    firstName: 'Contract',
    lastName: login,
  });

  test('contract: a new account is a pending user unless told otherwise, and carries no password', async () => {
    const { repository } = await setUp();

    const plain = await repository.create(input('Plain'));
    const author = await repository.create(
      { ...input('Writer'), status: 'active' },
      'author'
    );

    assert.equal(plain.login, 'Plain');
    assert.equal(plain.role, 'user');
    assert.equal(plain.status, 'pending');
    assert.equal('password' in plain, false);
    assert.equal(author.role, 'author');
    assert.equal(author.status, 'active');
    const found = await repository.findById(plain.id);
    assert.equal(found?.login, 'Plain');
    assert.equal('password' in (found ?? {}), false);
  });

  test('contract: a taken login or email is a conflict naming the field', async () => {
    const { repository } = await setUp();
    await repository.create(input('Taken'));
    const other = await repository.create(input('Other'));

    await assert.rejects(
      repository.create({ ...input('Taken'), email: 'fresh@example.com' }),
      new ConflictError('login')
    );
    // Email is compared without case, as its collation makes it in MySQL.
    await assert.rejects(
      repository.create({ ...input('Fresh'), email: 'TAKEN@example.com' }),
      new ConflictError('email')
    );
    await assert.rejects(
      repository.update(other.id, { login: 'Taken' }),
      new ConflictError('login')
    );
  });

  test('contract: every lookup and write on a missing account answers null or false', async () => {
    const { repository } = await setUp();

    assert.equal(await repository.findById(MISSING_ID), null);
    assert.equal(
      await repository.update(MISSING_ID, { firstName: 'Nobody' }),
      null
    );
    assert.equal(await repository.remove(MISSING_ID), false);
    assert.equal(await repository.updateRole(MISSING_ID, 'author'), null);
    assert.equal(await repository.findPasswordHashById(MISSING_ID), null);
    assert.equal(await repository.findByLoginWithPassword('Nobody'), null);
    assert.equal(await repository.findByEmail('nobody@example.com'), null);
  });

  test('contract: an update applies the fields given, and a new password never comes back', async () => {
    const { repository } = await setUp();
    const created = await repository.create(input('Editable'));

    const renamed = await repository.update(created.id, { firstName: 'New' });
    assert.equal(renamed?.firstName, 'New');
    assert.equal(renamed?.lastName, 'Editable');

    const repassworded = await repository.update(created.id, {
      password: 'another-password',
    });
    assert.equal(repassworded?.id, created.id);
    assert.equal('password' in (repassworded ?? {}), false);
    const hash = await repository.findPasswordHashById(created.id);
    assert.ok(hash);
    assert.equal(await verifyPassword(hash, 'another-password'), true);
  });

  test('contract: updateRole answers with the public user holding the new role', async () => {
    const { repository } = await setUp();
    const created = await repository.create(input('Promoted'));

    const updated = await repository.updateRole(created.id, 'author');

    assert.equal(updated?.id, created.id);
    assert.equal(updated?.role, 'author');
    assert.equal('password' in (updated ?? {}), false);
    assert.equal((await repository.findById(created.id))?.role, 'author');
  });

  test('contract: the credential reads carry a hash of the password that verifies', async () => {
    const { repository } = await setUp();
    const created = await repository.create({
      ...input('Signer'),
      status: 'blocked',
    });

    const credential = await repository.findByLoginWithPassword('Signer');
    assert.equal(credential?.id, created.id);
    assert.equal(credential?.status, 'blocked');
    assert.notEqual(credential?.password, 'contract-password');
    assert.equal(
      await verifyPassword(credential?.password ?? '', 'contract-password'),
      true
    );
    assert.equal(
      await repository.findPasswordHashById(created.id),
      credential?.password
    );
  });

  test('contract: findByEmail finds the account without case, and without its hash', async () => {
    const { repository } = await setUp();
    const created = await repository.create(input('Mailed'));

    const found = await repository.findByEmail('MAILED@example.com');

    assert.equal(found?.id, created.id);
    assert.equal('password' in (found ?? {}), false);
  });

  test('contract: the author search answers author accounts only, as summaries', async () => {
    const { repository } = await setUp();
    const author = await repository.create(
      { ...input('Searchable'), status: 'active' },
      'author'
    );
    await repository.create({ ...input('Reader'), status: 'active' });

    const found = await repository.listAuthors({ limit: 20 });

    assert.deepEqual(found, [
      {
        id: author.id,
        login: 'Searchable',
        firstName: 'Contract',
        lastName: 'Searchable',
      },
    ]);
  });

  test('contract: a removed account is gone', async () => {
    const { repository } = await setUp();
    const created = await repository.create(input('Leaving'));

    assert.equal(await repository.remove(created.id), true);
    assert.equal(await repository.findById(created.id), null);
    assert.equal(await repository.remove(created.id), false);
  });

  test('contract: an avatar round-trips, and a missing account reports false/null', async () => {
    const { repository } = await setUp();
    const created = await repository.create(input('Pictured'));
    const missingId = MISSING_ID;

    assert.equal(await repository.getAvatarData(created.id), null);
    assert.equal(
      await repository.setAvatar(created.id, Buffer.from('a')),
      true
    );
    assert.deepEqual(
      (await repository.getAvatarData(created.id))?.data,
      Buffer.from('a')
    );
    assert.equal(
      await repository.setAvatar(missingId, Buffer.from('a')),
      false
    );

    await repository.removeAvatar(created.id);
    assert.equal(await repository.getAvatarData(created.id), null);
    await repository.removeAvatar(missingId);
  });
}
