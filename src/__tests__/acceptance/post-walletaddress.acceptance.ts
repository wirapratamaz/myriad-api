import {Client, expect} from '@loopback/testlab';
import {MyriadApiApplication} from '../../application';
import {PlatformType} from '../../enums';
import {People, Post, UserSocialMedia} from '../../models';
import {
  PeopleRepository,
  PostRepository,
  UserSocialMediaRepository,
} from '../../repositories';
import {
  givenMyriadPostInstance,
  givenPeopleInstance,
  givenPeopleRepository,
  givenPostInstance,
  givenPostRepository,
  givenUserSocialMediaInstance,
  givenUserSocialMediaRepository,
  setupApplication,
} from '../helpers';
import {promisify} from 'util';
import {genSalt, hash} from 'bcryptjs';
import {config} from '../../config';
import {PolkadotJs} from '../../utils/polkadotJs-utils';

const jwt = require('jsonwebtoken');
const signAsync = promisify(jwt.sign);

describe('PostWalletAddressApplication', function () {
  let app: MyriadApiApplication;
  let client: Client;
  let postRepository: PostRepository;
  let userSocialMediaRepository: UserSocialMediaRepository;
  let peopleRepository: PeopleRepository;
  let people: People;
  let post: Post;
  let userSocialMedia: UserSocialMedia;
  let myriadPost: Post;

  before(async () => {
    ({app, client} = await setupApplication());
  });

  after(() => app.stop());

  before(async () => {
    postRepository = await givenPostRepository(app);
    userSocialMediaRepository = await givenUserSocialMediaRepository(app);
    peopleRepository = await givenPeopleRepository(app);
  });

  beforeEach(async () => {
    post = await givenPostInstance(postRepository);
    people = await givenPeopleInstance(peopleRepository);
    userSocialMedia = await givenUserSocialMediaInstance(
      userSocialMediaRepository,
      {peopleId: ''},
    );
    myriadPost = await givenMyriadPostInstance(postRepository, {
      platform: PlatformType.MYRIAD,
    });
  });

  it('gets a post wallet address from people', async () => {
    const password = people.id + config.ESCROW_SECRET_KEY;
    const salt = await genSalt(10);
    const hashPassword = await hash(password, salt);

    await postRepository.updateById(post.id, {peopleId: people.id});
    await peopleRepository.updateById(people.id, {
      walletAddressPassword: hashPassword,
    });
    const result = await client
      .get(`/posts/${post.id}/walletaddress`)
      .send()
      .expect(200);

    const token = await signAsync(
      {
        id: people.id,
        originUserId: people.originUserId,
        platform: people.platform,
        iat: new Date(people.createdAt ?? '').getTime(),
      },
      config.ESCROW_SECRET_KEY,
    );

    const {getKeyring, getHexPublicKey} = new PolkadotJs();
    const newKey = getKeyring().addFromUri('//' + token);

    expect(result.body).to.deepEqual({
      walletAddress: getHexPublicKey(newKey),
    });
  });

  it('gets a post wallet address from user', async () => {
    await postRepository.updateById(post.id, {peopleId: people.id});
    await userSocialMediaRepository.updateById(userSocialMedia.id, {
      peopleId: people.id,
    });
    const result = await client
      .get(`/posts/${post.id}/walletaddress`)
      .send()
      .expect(200);

    expect(result.body).to.deepEqual({walletAddress: userSocialMedia.userId});
  });

  it('gets a post wallet address if post platform myriad', async () => {
    const result = await client
      .get(`/posts/${myriadPost.id}/walletaddress`)
      .send()
      .expect(200);

    expect(result.body).to.deepEqual({walletAddress: myriadPost.createdBy});
  });

  it('returns 401 and 404 when wallet address not found', async () => {
    await client.get(`/posts/${post.id}/walletaddress`).send().expect(404);
    await postRepository.updateById(post.id, {peopleId: people.id});
    await client.get(`/posts/${post.id}/walletaddress`).send().expect(401);
  });
});
