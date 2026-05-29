import nodemailer from 'nodemailer';
import { NotificationModel } from '../models/Notification';
import { SettingModel } from '../models/Setting';
import { env } from '../config/env';
import logger from '../utils/logger';
import { NotificationType } from '../types';

let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter | null {
  if (!env.smtp.host) return null;

  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.smtp.host,
      port: env.smtp.port,
      secure: env.smtp.port === 465,
      auth: {
        user: env.smtp.user,
        pass: env.smtp.pass,
      },
    });
  }

  return transporter;
}

export const notificationService = {
  async createNotification(
    userId: number,
    type: NotificationType,
    title: string,
    message: string,
    link?: string
  ): Promise<number> {
    const id = await NotificationModel.create({
      user_id: userId,
      type,
      title,
      message,
      link: link || null,
    });

    // 检查是否需要发送邮件
    await this.trySendEmail(title, message);

    return id;
  },

  async createForAllAdmins(
    type: NotificationType,
    title: string,
    message: string,
    link?: string
  ): Promise<void> {
    await NotificationModel.createForAllAdmins({
      type,
      title,
      message,
      link: link || null,
    });

    await this.trySendEmail(title, message);
  },

  async getNotifications(userId: number, filters: any) {
    return NotificationModel.findByUserId(userId, filters);
  },

  async getUnreadCount(userId: number): Promise<number> {
    return NotificationModel.getUnreadCount(userId);
  },

  async markAsRead(id: number, userId: number): Promise<void> {
    await NotificationModel.markAsRead(id, userId);
  },

  async markAllAsRead(userId: number): Promise<void> {
    await NotificationModel.markAllAsRead(userId);
  },

  async trySendEmail(subject: string, body: string): Promise<void> {
    try {
      const emailEnabled = await SettingModel.get('email_notification_enabled');
      if (emailEnabled !== 'true') return;

      const notificationEmail = await SettingModel.get('notification_email');
      if (!notificationEmail || notificationEmail === '""') return;

      const transport = getTransporter();
      if (!transport) return;

      await transport.sendMail({
        from: env.smtp.from || env.smtp.user,
        to: notificationEmail.replace(/^"|"$/g, ''),
        subject: `[PandaMart] ${subject}`,
        text: body,
      });

      logger.info('通知邮件发送成功');
    } catch (err) {
      logger.error('通知邮件发送失败:', err);
    }
  },
};
