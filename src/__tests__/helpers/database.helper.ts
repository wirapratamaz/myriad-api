import {
  CommentRepository,
  CurrencyRepository,
  ExperienceRepository,
  FriendRepository,
  LikeRepository,
  NotificationRepository,
  PeopleRepository,
  PostRepository,
  TransactionRepository,
  UserCurrencyRepository,
  UserExperienceRepository,
  UserRepository,
  UserSocialMediaRepository,
} from '../../repositories';
import {testdb} from './testdb.datascource';

export async function givenRepositories() {
  const userRepository: UserRepository = new UserRepository(
    testdb,
    async () => userSocialMediaRepository,
    async () => userCurrencyRepository,
    async () => currencyRepository,
    async () => friendRepository,
    async () => experienceRepository,
    async () => userExperienceRepository,
  );
  const userExperienceRepository: UserExperienceRepository = new UserExperienceRepository(
    testdb,
    async () => experienceRepository,
    async () => userRepository,
  );
  const userSocialMediaRepository: UserSocialMediaRepository = new UserSocialMediaRepository(
    testdb,
    async () => userRepository,
    async () => peopleRepository,
  );
  const peopleRepository: PeopleRepository = new PeopleRepository(
    testdb,
    async () => userSocialMediaRepository,
    async () => postRepository,
  );
  const postRepository: PostRepository = new PostRepository(
    testdb,
    async () => peopleRepository,
    async () => userRepository,
    async () => commentRepository,
    async () => transactionRepository,
    async () => likeRepository,
  );
  const userCurrencyRepository: UserCurrencyRepository = new UserCurrencyRepository(
    testdb,
    async () => currencyRepository,
  );
  const currencyRepository: CurrencyRepository = new CurrencyRepository(testdb);
  const friendRepository: FriendRepository = new FriendRepository(
    testdb,
    async () => userRepository,
  );
  const experienceRepository: ExperienceRepository = new ExperienceRepository(
    testdb,
    async () => userRepository,
  );
  const commentRepository: CommentRepository = new CommentRepository(
    testdb,
    async () => postRepository,
    async () => userRepository,
    async () => transactionRepository,
  );
  const transactionRepository: TransactionRepository = new TransactionRepository(
    testdb,
    async () => userRepository,
    async () => currencyRepository,
  );
  const likeRepository: LikeRepository = new LikeRepository(
    testdb,
    async () => postRepository,
    async () => userRepository,
  );
  const notificationRepository: NotificationRepository = new NotificationRepository(
    testdb,
    async () => userRepository,
  );

  return {
    userRepository,
    userSocialMediaRepository,
    userCurrencyRepository,
    currencyRepository,
    friendRepository,
    experienceRepository,
    userExperienceRepository,
    peopleRepository,
    postRepository,
    commentRepository,
    transactionRepository,
    likeRepository,
    notificationRepository,
  };
}

export async function givenEmptyDatabase() {
  const {
    userRepository,
    userCurrencyRepository,
    friendRepository,
    currencyRepository,
    notificationRepository,
    transactionRepository,
    commentRepository,
    postRepository,
    userSocialMediaRepository,
    peopleRepository,
  } = await givenRepositories();

  await peopleRepository.deleteAll();
  await userRepository.deleteAll();
  await userCurrencyRepository.deleteAll();
  await friendRepository.deleteAll();
  await currencyRepository.deleteAll();
  await notificationRepository.deleteAll();
  await transactionRepository.deleteAll();
  await commentRepository.deleteAll();
  await postRepository.deleteAll();
  await userSocialMediaRepository.deleteAll();
}