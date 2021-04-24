import {
  Filter,
  FilterExcludingWhere,
  repository
} from '@loopback/repository';
import {
  del,
  get,
  getModelSchemaRef,
  param,
  patch,
  post,
  requestBody,
  response,
  HttpErrors
} from '@loopback/rest';
import {Keyring} from '@polkadot/api';
import {polkadotApi} from '../helpers/polkadotApi';
import {User} from '../models';
import {ExperienceRepository, PeopleRepository, TagRepository, UserRepository} from '../repositories';

export class UserController {
  constructor(
    @repository(UserRepository)
    public userRepository: UserRepository,
    @repository(ExperienceRepository)
    public experienceRepository: ExperienceRepository,
    @repository(TagRepository)
    public tagRepository: TagRepository,
    @repository(PeopleRepository)
    public peopleRepository: PeopleRepository
  ) { }

  @post('/users')
  @response(200, {
    description: 'User model instance',
    content: {'application/json': {schema: getModelSchemaRef(User)}},
  })
  async create(
    @requestBody({
      content: {
        'application/json': {
          schema: getModelSchemaRef(User, {
            title: 'NewUser',

          }),
        },
      },
    })
    user: User,
  ): Promise<User> {
    const foundUser = await this.userRepository.findOne({where: {or: [{id: user.id}, {name: user.name}]}})

    try {
      const api = await polkadotApi()

      if (!foundUser) {
        const keyring = new Keyring({type: 'sr25519', ss58Format: 214});
        const mnemonic = 'chalk cargo recipe ring loud deputy element hole moral soon lock credit';
        const from = keyring.addFromMnemonic(mnemonic);
        const to = user.id;
        const value = 100000000000000;

        const transfer = api.tx.balances.transfer(to, value);
        await transfer.signAndSend(from);
      }

      await api.disconnect()

      user.name = user.name.replace(/\s\s+/g, ' ')
      .trim().split(' ').map(word => {
        return word[0].toUpperCase() + word.substr(1).toLowerCase()
      }).join(' ')

      const newUser = await this.userRepository.create({
        ...user,
        bio: user.bio ? user.bio : `Hello, my name is ${user.name}!`
      });

      await this.userRepository.savedExperiences(newUser.id).create({
        name: user.name + " Experience",
        createdAt: new Date().toString(),
        userId: newUser.id,
        tags: [
          {
            id: 'cryptocurrency',
            hide: false
          },
          {
            id: 'blockchain',
            hide: false
          },
          {
            id: 'technology',
            hide: false
          }
        ],
        people: [
          {
            username: "gavofyork",
            platform_account_id: "33962758",
            hide: false
          },
          {
            username: "CryptoChief",
            platform_account_id: "t2_e0t5q",
            hide: false
          }
        ],
        description: `Hello, ${user.name}! Welcome to myriad!`
      })

      return newUser
    } catch (err) {
      if (err.message === 'LostConnection') {
        throw new HttpErrors.UnprocessableEntity('Myriad RPC Lost Connection')
      }

      throw new HttpErrors.UnprocessableEntity('User already exists');
    }
  }

  // @get('/users/count')
  // @response(200, {
  //   description: 'User model count',
  //   content: {'application/json': {schema: CountSchema}},
  // })
  // async count(
  //   @param.where(User) where?: Where<User>,
  // ): Promise<Count> {
  //   return this.userRepository.count(where);
  // }

  @get('/users')
  @response(200, {
    description: 'Array of User model instances',
    content: {
      'application/json': {
        schema: {
          type: 'array',
          items: getModelSchemaRef(User, {includeRelations: true}),
        },
      },
    },
  })
  async find(
    @param.filter(User) filter?: Filter<User>,
  ): Promise<User[]> {
    return this.userRepository.find(filter);
  }

  // @patch('/users')
  // @response(200, {
  //   description: 'User PATCH success count',
  //   content: {'application/json': {schema: CountSchema}},
  // })
  // async updateAll(
  //   @requestBody({
  //     content: {
  //       'application/json': {
  //         schema: getModelSchemaRef(User, {partial: true}),
  //       },
  //     },
  //   })
  //   user: User,
  //   @param.where(User) where?: Where<User>,
  // ): Promise<Count> {
  //   return this.userRepository.updateAll(user, where);
  // }

  @get('/users/{id}')
  @response(200, {
    description: 'User model instance',
    content: {
      'application/json': {
        schema: getModelSchemaRef(User, {includeRelations: true}),
      },
    },
  })
  async findById(
    @param.path.string('id') id: string,
    @param.filter(User, {exclude: 'where'}) filter?: FilterExcludingWhere<User>
  ): Promise<User> {
    return this.userRepository.findById(id, filter);
  }

  @patch('/users/{id}')
  @response(204, {
    description: 'User PATCH success',
  })
  async updateById(
    @param.path.string('id') id: string,
    @requestBody({
      content: {
        'application/json': {
          schema: getModelSchemaRef(User, {partial: true}),
        },
      },
    })
    user: User,
  ): Promise<void> {
    await this.userRepository.updateById(id, user);
  }

  // @put('/users/{id}')
  // @response(204, {
  //   description: 'User PUT success',
  // })
  // async replaceById(
  //   @param.path.string('id') id: string,
  //   @requestBody() user: User,
  // ): Promise<void> {
  //   await this.userRepository.replaceById(id, user);
  // }

  @del('/users/{id}')
  @response(204, {
    description: 'User DELETE success',
  })
  async deleteById(@param.path.string('id') id: string): Promise<void> {
    await this.userRepository.deleteById(id);
  }
}
