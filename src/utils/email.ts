import nodemailer from 'nodemailer';

// Create transporter
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.EMAIL_PORT || '587'),
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS, // App password for Gmail
  },
});

// Verify transporter on startup
transporter.verify((error) => {
  if (error) {
    console.error('❌ Email transporter error:', error);
  } else {
    console.log('✅ Email transporter is ready');
  }
});

export const sendEmail = async (to: string, subject: string, html: string) => {
  try {
    // Validate email configuration
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
      console.warn('⚠️ Email credentials not configured, skipping email send');
      return null;
    }

    const info = await transporter.sendMail({
      from: `"Event Management" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      html,
    });
    
    console.log('✅ Email sent:', info.messageId);
    return info;
  } catch (error) {
    console.error('❌ Email error:', error);
    // Don't throw error to avoid breaking the main functionality
    return null;
  }
};

// Transaction email templates
export const sendTransactionCreatedEmail = async (email: string, transaction: any) => {
  const subject = `Transaction Created - ${transaction.invoiceNumber}`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px;">
      <div style="text-align: center; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; border-radius: 10px 10px 0 0; color: white;">
        <h1 style="margin: 0;">🎉 Transaction Created!</h1>
      </div>
      
      <div style="padding: 20px;">
        <p>Hello <strong>${transaction.user?.fullName || 'Valued Customer'}</strong>,</p>
        <p>Your transaction has been created successfully! Here are your transaction details:</p>
        
        <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; margin: 20px 0;">
          <h3 style="margin-top: 0; color: #333;">📋 Transaction Summary</h3>
          <table style="width: 100%;">
            <tr>
              <td><strong>Invoice Number:</strong></td>
              <td>${transaction.invoiceNumber}</td>
            </tr>
            <tr>
              <td><strong>Event:</strong></td>
              <td>${transaction.event.title}</td>
            </tr>
            <tr>
              <td><strong>Total Amount:</strong></td>
              <td>IDR ${transaction.totalAmount.toLocaleString()}</td>
            </tr>
            <tr>
              <td><strong>Final Amount:</strong></td>
              <td style="color: #27ae60; font-weight: bold;">IDR ${transaction.finalAmount.toLocaleString()}</td>
            </tr>
            <tr>
              <td><strong>Status:</strong></td>
              <td><span style="background: #f39c12; color: white; padding: 4px 8px; border-radius: 4px;">${transaction.status}</span></td>
            </tr>
            <tr>
              <td><strong>Expiry Time:</strong></td>
              <td>${new Date(transaction.expiryTime).toLocaleString('id-ID')}</td>
            </tr>
          </table>
        </div>

        <div style="background: #fff3cd; padding: 15px; border-radius: 8px; margin: 20px 0; border: 1px solid #ffeaa7;">
          <h4 style="margin-top: 0; color: #856404;">⏰ Important Notice</h4>
          <p style="margin: 0; color: #856404;">
            Please upload your payment proof within <strong>2 hours</strong> to complete your transaction. 
            Your transaction will be automatically cancelled if no payment proof is uploaded before the expiry time.
          </p>
        </div>

        <p>Thank you for choosing our platform! We're excited to see you at the event! 🎊</p>
        
        <div style="text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e0e0e0;">
          <p style="color: #666; font-size: 14px;">
            Need help? Contact our support team at 
            <a href="mailto:support@eventmanagement.com" style="color: #667eea;">support@eventmanagement.com</a>
          </p>
        </div>
      </div>
    </div>
  `;

  return sendEmail(email, subject, html);
};

export const sendTransactionConfirmedEmail = async (email: string, transaction: any, isAccepted: boolean) => {
  const status = isAccepted ? 'Confirmed' : 'Rejected';
  const statusColor = isAccepted ? '#27ae60' : '#e74c3c';
  const statusEmoji = isAccepted ? '✅' : '❌';
  const subject = `Transaction ${status} - ${transaction.invoiceNumber}`;
  
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px;">
      <div style="text-align: center; background: linear-gradient(135deg, ${statusColor} 0%, ${isAccepted ? '#2ecc71' : '#c0392b'} 100%); padding: 20px; border-radius: 10px 10px 0 0; color: white;">
        <h1 style="margin: 0;">${statusEmoji} Transaction ${status}</h1>
      </div>
      
      <div style="padding: 20px;">
        <p>Hello <strong>${transaction.user?.fullName || 'Valued Customer'}</strong>,</p>
        <p>Your transaction has been <strong style="color: ${statusColor};">${status.toLowerCase()}</strong> by the event organizer.</p>
        
        <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; margin: 20px 0;">
          <h3 style="margin-top: 0; color: #333;">📋 Transaction Details</h3>
          <table style="width: 100%;">
            <tr>
              <td><strong>Invoice Number:</strong></td>
              <td>${transaction.invoiceNumber}</td>
            </tr>
            <tr>
              <td><strong>Event:</strong></td>
              <td>${transaction.event.title}</td>
            </tr>
            <tr>
              <td><strong>Final Amount:</strong></td>
              <td>IDR ${transaction.finalAmount.toLocaleString()}</td>
            </tr>
            <tr>
              <td><strong>Status:</strong></td>
              <td><span style="background: ${statusColor}; color: white; padding: 4px 8px; border-radius: 4px;">${transaction.status}</span></td>
            </tr>
          </table>
        </div>

        ${isAccepted ? 
          `<div style="background: #d4edda; padding: 15px; border-radius: 8px; margin: 20px 0; border: 1px solid #c3e6cb;">
            <h4 style="margin-top: 0; color: #155724;">🎉 Congratulations!</h4>
            <p style="margin: 0; color: #155724;">
              Your tickets have been confirmed! You're all set to attend the event. 
              We look forward to seeing you there!
            </p>
          </div>` :
          `<div style="background: #f8d7da; padding: 15px; border-radius: 8px; margin: 20px 0; border: 1px solid #f5c6cb;">
            <h4 style="margin-top: 0; color: #721c24;">📝 Notice</h4>
            <p style="margin: 0; color: #721c24;">
              Your transaction has been rejected. If you have any questions or believe this is a mistake, 
              please contact the event organizer directly.
            </p>
          </div>`
        }
        
        <div style="text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e0e0e0;">
          <p style="color: #666; font-size: 14px;">
            For any questions, contact us at 
            <a href="mailto:support@eventmanagement.com" style="color: #667eea;">support@eventmanagement.com</a>
          </p>
        </div>
      </div>
    </div>
  `;

  return sendEmail(email, subject, html);
};

export const sendWelcomeEmail = async (email: string, fullName: string) => {
  const subject = 'Welcome to Event Management Platform!';
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px;">
      <div style="text-align: center; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px 10px 0 0; color: white;">
        <h1 style="margin: 0; font-size: 28px;">🎊 Welcome Aboard!</h1>
        <p style="margin: 10px 0 0 0; font-size: 16px; opacity: 0.9;">We're thrilled to have you join our community</p>
      </div>
      
      <div style="padding: 30px;">
        <p>Hello <strong style="color: #667eea;">${fullName}</strong>,</p>
        <p>Thank you for registering with our event management platform! Your account has been successfully created and you're now part of our growing community.</p>
        
        <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 25px 0;">
          <h3 style="margin-top: 0; color: #333;">🚀 Get Started</h3>
          <p>Here's what you can do with your new account:</p>
          <ul style="line-height: 1.6;">
            <li>🎫 <strong>Discover Events</strong> - Browse through amazing events in your area</li>
            <li>💳 <strong>Secure Booking</strong> - Purchase tickets with multiple payment options</li>
            <li>🎁 <strong>Earn Rewards</strong> - Get points and coupons for your transactions</li>
            <li>👥 <strong>Refer Friends</strong> - Share your referral code and earn bonuses</li>
            <li>⭐ <strong>Share Experiences</strong> - Review events you've attended</li>
          </ul>
        </div>

        <div style="background: #e8f4fd; padding: 15px; border-radius: 8px; margin: 20px 0; border: 1px solid #b6e0fe;">
          <h4 style="margin-top: 0; color: #0c5460;">💡 Pro Tip</h4>
          <p style="margin: 0; color: #0c5460;">
            Complete your profile and verify your email to unlock all features and get personalized event recommendations!
          </p>
        </div>

        <div style="text-align: center; margin: 30px 0;">
          <a href="${process.env.FRONTEND_URL || 'https://youreventplatform.com'}/events" 
             style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">
            Explore Events Now
          </a>
        </div>

        <p>We're committed to providing you with the best event experience. If you have any questions or need assistance, don't hesitate to reach out to our support team.</p>
        
        <br>
        <p>Happy exploring! 🎉</p>
        
        <div style="text-align: center; margin-top: 40px; padding-top: 20px; border-top: 1px solid #e0e0e0;">
          <p style="color: #666; font-size: 14px; margin: 0;">
            Best regards,<br>
            <strong style="color: #333;">Event Management Team</strong><br>
            <a href="mailto:support@eventmanagement.com" style="color: #667eea;">support@eventmanagement.com</a>
          </p>
        </div>
      </div>
    </div>
  `;

  return sendEmail(email, subject, html);
};

export default transporter;