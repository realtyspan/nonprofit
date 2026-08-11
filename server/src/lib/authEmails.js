// "Forgot password" email template — plain and functional, unlike the Raffle
// module's buyer-facing templates, since this is an internal account-recovery
// email rather than something meant to look festive/promotional.
function resetPasswordHtml({ resetUrl, orgName }) {
  return `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#F9F8F7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#201F1E;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#F9F8F7;padding:32px 12px;">
    <tr><td align="center">
      <table role="presentation" width="480" cellspacing="0" cellpadding="0" border="0" style="max-width:480px;background:#ffffff;border-radius:8px;border:1px solid #E1DFDD;">
        <tr><td style="padding:28px 32px 8px 32px;">
          <div style="font-size:15px;font-weight:700;">${orgName} — Bell Jar Manager</div>
        </td></tr>
        <tr><td style="padding:12px 32px 4px 32px;">
          <h1 style="margin:0 0 10px 0;font-size:18px;">Reset your password</h1>
          <p style="margin:0 0 18px 0;font-size:14px;line-height:1.55;">Someone requested a password reset for this account. Click below to choose a new password — this link works once and expires in 1 hour.</p>
          <a href="${resetUrl}" style="display:inline-block;background:#5b52d6;color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 20px;border-radius:8px;">Reset password</a>
          <p style="margin:20px 0 0 0;font-size:12px;color:#605E5C;line-height:1.5;">If you didn't request this, you can safely ignore this email — your password won't change unless you click the link above and set a new one.</p>
        </td></tr>
        <tr><td style="padding:20px 32px 24px 32px;border-top:1px solid #F1EFED;margin-top:16px;">
          <p style="margin:0;font-size:11.5px;color:#8b8b95;word-break:break-all;">${resetUrl}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

module.exports = { resetPasswordHtml };
