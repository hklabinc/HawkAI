using System.Net;
using System.Net.Mail;
using System.Threading.Tasks;

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
                var mail = new MailMessage();
                mail.From = new MailAddress(senderEmail);
                mail.To.Add(recipientEmail);
                mail.Subject = subject;
                mail.Body = body;
                mail.IsBodyHtml = false;

                var smtp = new SmtpClient("smtp.gmail.com", 587)
                {
                    EnableSsl = true,
                    UseDefaultCredentials = false,
                    Credentials = new NetworkCredential(senderEmail, senderPassword),
                    DeliveryMethod = SmtpDeliveryMethod.Network
                };

                await smtp.SendMailAsync(mail);
                return true;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"❌ Email send error: {ex.Message}");
                return false;
            }
        }
    }
}
