import {BindingScope, injectable, service} from '@loopback/core';
import {AnyObject, repository} from '@loopback/repository';
import {config} from '../config';
import {NotificationType, ReferenceType, ReportStatusType} from '../enums';
import {
  Comment,
  MentionUser,
  Notification,
  Transaction,
  User,
  UserSocialMedia,
  Vote,
} from '../models';
import {
  CommentRepository,
  FriendRepository,
  NotificationRepository,
  NotificationSettingRepository,
  PostRepository,
  ReportRepository,
  UserReportRepository,
  UserRepository,
  UserSocialMediaRepository,
} from '../repositories';
import {PolkadotJs} from '../utils/polkadotJs-utils';
import {FCMService} from './fcm.service';

@injectable({scope: BindingScope.TRANSIENT})
export class NotificationService {
  constructor(
    @repository(UserRepository)
    public userRepository: UserRepository,
    @repository(PostRepository)
    public postRepository: PostRepository,
    @repository(NotificationRepository)
    public notificationRepository: NotificationRepository,
    @repository(UserSocialMediaRepository)
    public userSocialMediaRepository: UserSocialMediaRepository,
    @repository(FriendRepository)
    public friendRepository: FriendRepository,
    @repository(ReportRepository)
    public reportRepository: ReportRepository,
    @repository(CommentRepository)
    public commentRepository: CommentRepository,
    @repository(UserReportRepository)
    public userReportReportRepository: UserReportRepository,
    @repository(NotificationSettingRepository)
    public notificationSettingRepository: NotificationSettingRepository,
    @service(FCMService)
    public fcmService: FCMService,
  ) {}

  async sendFriendRequest(from: string, to: string): Promise<boolean> {
    const active = await this.checkNotificationSetting(
      to,
      NotificationType.FRIEND_REQUEST,
    );
    if (!active) return false;

    const fromUser = await this.userRepository.findById(from);
    const notification = new Notification({
      type: NotificationType.FRIEND_REQUEST,
      from: fromUser.id,
      referenceId: fromUser.id,
      message: 'sent you friend request',
    });

    const title = 'Friend Request Accepted';
    const body = fromUser.name + ' ' + notification.message;

    await this.sendNotificationToUser(notification, to, title, body);

    return true;
  }

  async sendFriendAccept(from: string, to: string): Promise<boolean> {
    const fromUser = await this.userRepository.findById(from);
    const toUser = await this.userRepository.findById(to);

    const notification = new Notification({
      type: NotificationType.FRIEND_ACCEPT,
      from: fromUser.id,
      referenceId: fromUser.id,
      message: 'accept your friend request',
    });

    const title = 'Friend Request Accepted';
    const body = fromUser.name + ' ' + notification.message;

    await this.sendNotificationToUser(notification, toUser.id, title, body);

    return true;
  }

  async cancelFriendRequest(from: string, to: string): Promise<void> {
    const notification = await this.notificationRepository.findOne({
      where: {
        type: NotificationType.FRIEND_REQUEST,
        from: from,
        to: to,
        referenceId: from,
      },
    });

    if (notification === null) return;

    await this.notificationRepository.deleteById(notification.id);

    return;
  }

  async sendPostComment(from: string, comment: Comment): Promise<boolean> {
    await this.sendMention(
      from,
      comment.id ?? '',
      comment.mentions,
      ReferenceType.COMMENT,
    );

    const fromUser = await this.userRepository.findById(from);
    const additionalReferenceId = await this.getCommentAdditionalReferenceIds(
      comment.id ?? '',
    );

    const notification = new Notification({
      type:
        comment.type === ReferenceType.POST
          ? NotificationType.POST_COMMENT
          : NotificationType.COMMENT_COMMENT,
      from: fromUser.id,
      referenceId: comment.id,
      message: 'commented: ' + comment.text,
      additionalReferenceId: additionalReferenceId,
    });

    const post = await this.postRepository.findById(comment.postId);

    // FCM messages
    const title = 'New Comment';
    const body = fromUser.name + ' commented to your post';

    // Notification comment to comment
    if (comment.type === ReferenceType.COMMENT) {
      const toComment = await this.commentRepository.findById(
        comment.referenceId,
      );

      if (toComment.userId !== comment.userId) {
        const commentActive = await this.checkNotificationSetting(
          toComment.userId,
          NotificationType.COMMENT_COMMENT,
        );
        if (commentActive) {
          await this.sendNotificationToUser(
            notification,
            toComment.userId,
            title,
            fromUser.name + ' ' + 'reply to your comment',
          );
        }
      }
    }

    // Notification comment to post
    if (post.createdBy === comment.userId) return false;

    const postActive = await this.checkNotificationSetting(
      post.createdBy,
      NotificationType.POST_COMMENT,
    );

    if (!postActive) return postActive;

    await this.sendNotificationToUser(
      notification,
      post.createdBy,
      title,
      body,
    );

    return true;
  }

  async sendReportResponseToReporters(reportId: string): Promise<boolean> {
    const {referenceType, referenceId} = await this.reportRepository.findById(
      reportId,
    );
    const reporters = await this.userReportReportRepository.find({
      where: {reportId: reportId},
    });

    if (reporters.length === 0) return false;

    const {getKeyring, getHexPublicKey} = new PolkadotJs();

    const mnemonic = config.MYRIAD_MNEMONIC;
    const pair = getKeyring().addFromMnemonic(mnemonic);

    const notification = new Notification({
      from: getHexPublicKey(pair),
      message: 'approved your report',
    });

    switch (referenceType) {
      case ReferenceType.USER: {
        notification.type = NotificationType.USER_BANNED;
        notification.referenceId = referenceId;
        break;
      }

      case ReferenceType.POST: {
        notification.type = NotificationType.POST_REMOVED;
        notification.referenceId = referenceId;
        break;
      }

      case ReferenceType.COMMENT: {
        notification.type = NotificationType.COMMENT_REMOVED;
        notification.referenceId = referenceId;
        notification.additionalReferenceId =
          await this.getCommentAdditionalReferenceIds(referenceId);
        break;
      }

      default:
        return false;
    }

    const reporterIds = reporters.map(reporter => reporter.reportedBy);
    const title = 'Report Approved';
    const body = 'Myriad Official ' + notification.message;

    await this.sendNotificationToMultipleUsers(
      notification,
      reporterIds,
      title,
      body,
    );

    return true;
  }

  async sendReportResponseToUser(reportId: string): Promise<boolean> {
    const {referenceId, referenceType, status} =
      await this.reportRepository.findById(reportId);

    if (status !== ReportStatusType.REMOVED) return false;

    const {getKeyring, getHexPublicKey} = new PolkadotJs();

    const mnemonic = config.MYRIAD_MNEMONIC;
    const pair = getKeyring().addFromMnemonic(mnemonic);

    const notification = new Notification({
      from: getHexPublicKey(pair),
    });

    switch (referenceType) {
      case ReferenceType.COMMENT: {
        notification.type = NotificationType.COMMENT_REMOVED;
        notification.referenceId = referenceId;
        notification.message = 'removed your comment';
        notification.additionalReferenceId =
          await this.getCommentAdditionalReferenceIds(referenceId);

        const comment = await this.commentRepository.findById(referenceId);

        await this.sendNotificationToUser(
          notification,
          comment.userId,
          'Comment Removed',
          'Myriad Official ' + notification.message,
        );

        break;
      }

      case ReferenceType.POST: {
        notification.type = NotificationType.POST_REMOVED;
        notification.referenceId = referenceId;
        notification.message = 'removed your post';

        const post = await this.postRepository.findById(referenceId);

        await this.sendNotificationToUser(
          notification,
          post.createdBy,
          'Post Removed',
          'Myriad Official ' + notification.message,
        );

        break;
      }

      case ReferenceType.USER: {
        notification.type = NotificationType.USER_BANNED;
        notification.referenceId = referenceId;
        notification.message = 'banned you';

        await this.sendNotificationToUser(
          notification,
          referenceId,
          'User Removed',
          'Myriad Official ' + notification.message,
        );

        break;
      }

      default:
        return false;
    }

    return true;
  }

  async sendPostVote(from: string, vote: Vote): Promise<boolean> {
    const fromUser = await this.userRepository.findById(from);
    const notification = new Notification({
      type:
        vote.type === ReferenceType.POST
          ? NotificationType.POST_VOTE
          : NotificationType.COMMENT_VOTE,
      from: fromUser.id,
      referenceId: vote.id,
      message: vote.state ? 'upvoted' : 'downvoted',
    });

    // FCM messages
    const title = 'New Vote';
    const body = fromUser.name + ' ' + notification.message;

    // Notification vote to comment
    if (vote.type === ReferenceType.COMMENT) {
      const toComment = await this.commentRepository.findById(vote.referenceId);

      notification.additionalReferenceId =
        await this.getCommentAdditionalReferenceIds(toComment.id ?? '');

      if (toComment.userId !== vote.userId) {
        await this.sendNotificationToUser(
          notification,
          toComment.userId,
          title,
          body,
        );

        return true;
      }

      return false;
    }

    const post = await this.postRepository.findById(vote.postId);

    await this.sendNotificationToUser(
      notification,
      post.createdBy,
      title,
      body,
    );

    return true;
  }

  async sendMention(
    from: string,
    to: string,
    mentions: MentionUser[],
    type?: ReferenceType,
  ): Promise<boolean> {
    if (mentions.length === 0) return false;

    const fromUser = await this.userRepository.findById(from);
    const notification = new Notification({
      type:
        type === ReferenceType.COMMENT
          ? NotificationType.COMMENT_MENTION
          : NotificationType.POST_MENTION,
      from: fromUser.id,
      referenceId: to,
      message: 'mentioned you',
    });

    if (type === ReferenceType.COMMENT) {
      notification.additionalReferenceId =
        await this.getCommentAdditionalReferenceIds(to);
    }

    // FCM messages
    const title = 'New Mention';
    const body = fromUser.name + ' ' + notification.message;

    const userIds = mentions
      .filter(mention => mention.id !== from)
      .filter(async user => {
        const mentionActive = await this.checkNotificationSetting(
          user.id,
          NotificationType.POST_MENTION,
        );

        if (!mentionActive) return false;
        return true;
      })
      .map(user => user.id);

    await this.sendNotificationToMultipleUsers(
      notification,
      userIds,
      title,
      body,
    );

    return true;
  }

  async sendTipsSuccess(transaction: Transaction): Promise<boolean> {
    const {from, to, type, referenceId} = transaction;
    const fromUser = await this.userRepository.findById(from);

    const tipsActive = await this.checkNotificationSetting(
      to,
      NotificationType.POST_TIPS,
    );
    if (!tipsActive) return false;

    const notification = new Notification({
      from: fromUser.id,
      referenceId: transaction.id,
      message: transaction.amount + ' ' + transaction.currencyId,
    });

    if (type === ReferenceType.COMMENT && referenceId) {
      notification.type = NotificationType.COMMENT_TIPS;
      notification.additionalReferenceId =
        await this.getCommentAdditionalReferenceIds(referenceId);
    } else if (type === ReferenceType.POST && referenceId) {
      notification.type = NotificationType.POST_TIPS;
      notification.additionalReferenceId = [{postId: referenceId}];
    } else notification.type = NotificationType.USER_TIPS;

    const title = 'Send Tips Success';
    const body = fromUser.name + ' ' + notification.message;

    await this.sendNotificationToUser(notification, to, title, body);

    return true;
  }

  async sendRewardSuccess(transaction: Transaction): Promise<boolean> {
    const {from, to} = transaction;

    const notification = new Notification({
      type: NotificationType.USER_REWARD,
      from: from,
      referenceId: transaction.id,
      message: transaction.amount + ' ' + transaction.currencyId,
    });

    const title = 'Send Reward Success';
    const body = 'Myriad Official' + ' ' + notification.message;

    await this.sendNotificationToUser(notification, to, title, body);

    return true;
  }

  async sendIntitalAUSD(transaction: Transaction): Promise<boolean> {
    const {from, to} = transaction;

    const notification = new Notification({
      type: NotificationType.USER_INITIAL_TIPS,
      from: from,
      referenceId: transaction.id,
      message: transaction.amount + ' ' + transaction.currencyId,
    });

    const title = 'Send Initial AUSD Success';
    const body = 'Myriad Official' + ' ' + notification.message;

    await this.sendNotificationToUser(notification, to, title, body);

    return true;
  }

  async sendClaimTips(transaction: Transaction): Promise<boolean> {
    const {to} = transaction;

    const tipsActive = await this.checkNotificationSetting(
      to,
      NotificationType.POST_TIPS,
    );
    if (!tipsActive) return false;

    const {getKeyring, getHexPublicKey} = new PolkadotJs();

    const mnemonic = config.MYRIAD_MNEMONIC;
    const pair = getKeyring().addFromMnemonic(mnemonic);

    const notification = new Notification({
      type: NotificationType.USER_CLAIM_TIPS,
      from: getHexPublicKey(pair),
      referenceId: transaction.id,
      message: transaction.amount + ' ' + transaction.currencyId,
    });

    const title = 'Send Claim Tips Success';
    const body = 'You ' + notification.message;

    await this.sendNotificationToUser(notification, to, title, body);

    return true;
  }

  async sendConnectedSocialMedia(userSocialMedia: UserSocialMedia) {
    const {userId, platform, peopleId} = userSocialMedia;

    const notification = new Notification({
      type: NotificationType.CONNECTED_SOCIAL_MEDIA,
      from: userId,
      referenceId: userId,
      message: `connected your ${platform} social media`,
      additionalReferenceId: [{peopleId: peopleId}],
    });

    const title = `Connected ${
      platform[0].toUpperCase() + platform.substring(1)
    } Success`;
    const body = 'You ' + notification.message;

    await this.sendNotificationToUser(notification, userId, title, body);

    return true;
  }

  async sendDisconnectedSocialMedia(id: string, fromUserId?: string) {
    const userSocialMedia = await this.userSocialMediaRepository.findById(id);
    const {userId, platform, peopleId} = userSocialMedia;

    if (!fromUserId) fromUserId = userId;
    else await this.userRepository.findById(fromUserId);

    const notification = new Notification({
      type: NotificationType.DISCONNECTED_SOCIAL_MEDIA,
      from: fromUserId,
      referenceId: fromUserId,
      message: `disconnected your ${platform} social media`,
      additionalReferenceId: [{peopleId: peopleId}],
    });

    const title = `Disconnected ${
      platform[0].toUpperCase() + platform.substring(1)
    } Success`;
    const body = 'You ' + notification.message;

    await this.sendNotificationToUser(notification, userId, title, body);

    return true;
  }

  async sendNotificationToUser(
    notification: Notification,
    userId: string,
    title?: string,
    body?: string,
  ): Promise<void> {
    const user = await this.userRepository.findById(userId);
    const createdNotification = await this.notificationRepository.create({
      ...notification,
      to: user.id,
    });

    if (!createdNotification) return;

    await this.fcmService.sendNotification(
      user.fcmTokens,
      title,
      body,
      createdNotification,
    );
  }

  async sendNotificationToMultipleUsers(
    notification: Notification,
    userIds: string[],
    title?: string,
    body?: string,
  ): Promise<void> {
    const notifications = userIds.map(id => {
      const updatedNotification = {
        ...notification,
        to: id,
      };

      return new Notification(updatedNotification);
    });

    const createdNotifications = await this.notificationRepository.createAll(
      notifications,
    );

    if (!createdNotifications || !createdNotifications.length) return;

    const users = await this.userRepository.find({
      where: {
        or: userIds.map(userId => {
          return {
            id: userId,
          };
        }),
      },
    });

    await Promise.all(
      users.map(user => {
        const found = createdNotifications.find(notif => notif.to === user.id);

        if (found) {
          return this.fcmService.sendNotification(
            user.fcmTokens,
            title,
            body,
            found,
          );
        }

        return;
      }),
    );
  }

  async getCommentAdditionalReferenceIds(
    commentId: string,
  ): Promise<AnyObject[]> {
    const lastCommentId = commentId;

    let additionalReferenceId = [];
    let firstCommentId = null;
    let secondCommentId = null;

    let lastComment = await this.commentRepository.findById(lastCommentId);

    if (lastComment.type === ReferenceType.POST) {
      additionalReferenceId = [{postId: lastComment.postId}];
    } else {
      lastComment = await this.commentRepository.findById(
        lastComment.referenceId,
      );

      firstCommentId = lastComment.id;
      secondCommentId = lastComment.id;

      if (lastComment.type === ReferenceType.POST) {
        additionalReferenceId = [
          {postId: lastComment.postId},
          {firstCommentId: firstCommentId},
        ];
      } else {
        lastComment = await this.commentRepository.findById(
          lastComment.referenceId,
        );
        firstCommentId = lastComment.id;

        additionalReferenceId = [
          {postId: lastComment.postId},
          {firstCommentId: firstCommentId},
          {secondCommentId: secondCommentId},
        ];
      }
    }

    return additionalReferenceId;
  }

  async checkNotificationSetting(
    userId: string,
    type: NotificationType,
  ): Promise<boolean> {
    const notificationSetting =
      await this.notificationSettingRepository.findOne({
        where: {userId: userId},
      });

    if (notificationSetting) {
      switch (type) {
        case NotificationType.FRIEND_REQUEST:
          if (!notificationSetting.friendRequests) return false;
          break;

        case NotificationType.POST_COMMENT:
        case NotificationType.COMMENT_COMMENT:
          if (!notificationSetting.comments) return false;
          break;

        case NotificationType.POST_MENTION:
        case NotificationType.COMMENT_MENTION:
          if (!notificationSetting.mentions) return false;
          break;

        case NotificationType.POST_TIPS:
        case NotificationType.COMMENT_TIPS:
        case NotificationType.USER_TIPS:
          if (!notificationSetting.tips) return false;
          break;

        default:
          return false;
      }
    }

    return true;
  }
}
