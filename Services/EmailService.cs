using System.Threading.Tasks;
using MailKit.Net.Smtp;
using MailKit.Security;
using MimeKit;

namespace HawkAI.Services
{
    public class EmailService
    {
        private readonly string senderEmail;
        private readonly string senderPassword;

        public EmailService(string email, string password)
        {
            senderEmail = email;
            senderPassword = password;
        }

        public async Task<bool> SendEmailAsync(string recipientEmail, string subject, string body)
        {
            try
            {
                var message = new MimeMessage();
                message.From.Add(new MailboxAddress("보내는 이름", senderEmail));
                message.To.Add(MailboxAddress.Parse(recipientEmail));
                message.Subject = subject;
                message.Body = new TextPart("plain")
                {
                    Text = body
                };

                using var client = new SmtpClient();
                await client.ConnectAsync("smtp.gmail.com", 465, SecureSocketOptions.SslOnConnect);
                await client.AuthenticateAsync(senderEmail, senderPassword);
                await client.SendAsync(message);
                await client.DisconnectAsync(true);

                return true;
            }
            catch (System.Exception ex)
            {
                Console.WriteLine($"❌ Email send error: {ex.Message}");
                return false;
            }
        }
    }
}
