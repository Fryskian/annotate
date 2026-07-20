(function () {
  "use strict";

  var wp = window.AnnotateWordPress || {};
  var base = window.AnnotateConfig || {};
  try {
    if (wp.reviewer && wp.reviewer.name && !localStorage.getItem("an-author")) localStorage.setItem("an-author", wp.reviewer.name);
  } catch (error) {}

  function node(tag, attrs, children) {
    var element = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (key) {
      if (key === "text") element.textContent = attrs[key];
      else if (key === "class") element.className = attrs[key];
      else element.setAttribute(key, attrs[key]);
    });
    (children || []).forEach(function (child) { element.appendChild(child); });
    return element;
  }

  function uploadAttachment(file) {
    return fetch(wp.mediaUrl, {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "X-WP-Nonce": wp.nonce,
        "Content-Type": file.type,
        "Content-Disposition": "attachment; filename=" + encodeURIComponent(file.name),
      },
      body: file,
    }).then(function (response) {
      return response.json().then(function (data) {
        if (!response.ok) throw new Error(data.message || "Image upload failed");
        return {
          id: data.id,
          url: data.source_url,
          filename: file.name,
          mime: data.mime_type || file.type,
          width: data.media_details && data.media_details.width || null,
          height: data.media_details && data.media_details.height || null,
        };
      });
    });
  }

  function submitReview(review) {
    return new Promise(function (resolve, reject) {
      var old = document.getElementById("__an_wp_submit");
      if (old) old.remove();

      var title = node("h2", { id: "__an_wp_submit_title", text: "Submit review" });
      var name = node("input", { id: "__an_wp_name", name: "name", required: "", maxlength: "100", value: wp.reviewer && wp.reviewer.name || "" });
      var email = node("input", { id: "__an_wp_email", name: "email", type: "email", required: "", maxlength: "200", value: wp.reviewer && wp.reviewer.email || "" });
      var message = node("textarea", { id: "__an_wp_message", name: "message", rows: "4", maxlength: "2000" });
      var status = node("p", { class: "an-wp-status", role: "status", "aria-live": "polite" });
      var cancel = node("button", { type: "button", class: "an-wp-cancel", text: "Cancel" });
      var submit = node("button", { type: "submit", text: "Submit review" });
      var form = node("form", {}, [
        title,
        node("p", { class: "an-wp-intro", text: "Send these annotations for implementation review." }),
        node("label", { for: name.id, text: "Your name" }), name,
        node("label", { for: email.id, text: "Your email" }), email,
        node("label", { for: message.id, text: "Overall message" }), message,
        status,
        node("div", { class: "an-wp-actions" }, [cancel, submit]),
      ]);
      var dialog = node("dialog", { id: "__an_wp_submit", "aria-labelledby": title.id, "data-annotate-ui": "" }, [form]);

      cancel.addEventListener("click", function () { dialog.close(); resolve(null); });
      dialog.addEventListener("cancel", function () { resolve(null); });
      dialog.addEventListener("close", function () { setTimeout(function () { dialog.remove(); }, 0); });
      form.addEventListener("submit", function (event) {
        event.preventDefault();
        submit.disabled = true;
        status.textContent = "Submitting…";
        var headers = { "Content-Type": "application/json" };
        headers[wp.nonceHeader || "X-WP-Nonce"] = wp.nonce;
        fetch(wp.restUrl, {
          method: "POST",
          credentials: "same-origin",
          headers: headers,
          body: JSON.stringify({
            reviewer: { name: name.value.trim(), email: email.value.trim() },
            message: message.value.trim(),
            review: review,
          }),
        }).then(function (response) {
          return response.json().then(function (data) {
            if (!response.ok) throw new Error(data.message || "Submission failed");
            status.textContent = "Review #" + data.id + " saved" + (data.mailSent ? " and email sent." : ", but the email notification failed.");
            submit.remove();
            cancel.textContent = "Close";
            resolve(data);
          });
        }).catch(function (error) {
          submit.disabled = false;
          status.textContent = error.message || "Submission failed. Your annotations are still saved in this browser.";
          reject(error);
        });
      });

      document.body.appendChild(dialog);
      dialog.showModal();
      name.focus();
    });
  }

  window.AnnotateConfig = Object.assign({}, base, {
    contentEditing: true,
    uploadAttachment: wp.canUpload ? uploadAttachment : null,
    submitReview: submitReview,
  });

  var style = node("style", { text: "#__an_wp_submit{width:min(440px,calc(100vw - 24px));max-height:calc(100vh - 32px);padding:0;border:1px solid var(--an-border,#ddd);border-radius:16px;background:var(--an-surface,#fff);color:var(--an-fg,#17171f);box-shadow:0 18px 60px rgba(0,0,0,.3);font:14px Inter,system-ui,sans-serif}#__an_wp_submit::backdrop{background:rgba(10,10,16,.52)}#__an_wp_submit form{padding:22px}#__an_wp_submit h2{margin:0 0 5px;font-size:19px}#__an_wp_submit .an-wp-intro{margin:0 0 18px;color:var(--an-muted,#666)}#__an_wp_submit label{display:block;margin:12px 0 6px;font-weight:700;font-size:12px}#__an_wp_submit input,#__an_wp_submit textarea{box-sizing:border-box;width:100%;padding:10px;border:1px solid var(--an-border-strong,#aaa);border-radius:9px;background:var(--an-surface,#fff);color:inherit;font:inherit}#__an_wp_submit input:focus,#__an_wp_submit textarea:focus{outline:2px solid var(--an-btn-bg,#6d28d9);outline-offset:2px}#__an_wp_submit .an-wp-status{min-height:20px;margin:12px 0 0;color:var(--an-muted,#666)}#__an_wp_submit .an-wp-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:14px}#__an_wp_submit button{min-height:40px;padding:8px 14px;border:0;border-radius:9px;background:var(--an-btn-bg,#6d28d9);color:var(--an-btn-fg,#fff);font-weight:700;cursor:pointer}#__an_wp_submit button:disabled{opacity:.55}#__an_wp_submit .an-wp-cancel{border:1px solid var(--an-border-strong,#aaa);background:transparent;color:inherit}@media(max-width:640px){#__an_wp_submit form{padding:18px}}" });
  document.head.appendChild(style);

  document.addEventListener("click", function (event) {
    var open = event.target.closest && event.target.closest("#wp-admin-bar-annotate-review a");
    if (open) { event.preventDefault(); if (window.Annotate) window.Annotate.open(); }
  });
  var adminBarItem = document.getElementById("wp-admin-bar-annotate-review");
  if (adminBarItem) adminBarItem.setAttribute("data-annotate-ui", "");
})();
