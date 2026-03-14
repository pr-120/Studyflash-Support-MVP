# Platorm Engineer Hiring Challenge

# 🎯 Objective

Studyflash receives thousands of support requests per month, with questions ranging from product unclarities, to bug reports, to refund requests. To handle these in a streamlined way, you are tasked with building an MVP for an internal support platform.

To keep the scope focused and implementation effort low, this MVP should prioritize *centralization and automation over perfection*. The platform is not intended to replace Outlook, but to act as an intelligent layer on top of it: ingesting incoming support emails, structuring them into actionable tickets, enriching them with internal context, and assisting the team with triage and responses. Manual workflows should only exist where automation is unreliable or high-risk, with the long-term goal of progressively increasing AI assistance and confidence over time.

Your primary task is to sketch a robust solution for an internal support platform with the lowest implementation effort. To achieve this, you are free to use AI tooling and open-source work as you see fit.

---

## 🔍 Current setup

Users submit support tickets through forms in the webapp and the mobile app. These emails arrive to the mailbox of a shared Outlook account.

Note that most team members are not proficient in the specific languages of the support tickets.

The attachment below contains an anonymized and tagged sample of 100 support requests that we typically deal with.

[tickets.zip](attachment:d4298165-0616-4e72-aa53-ec698c6ab95e:tickets.zip)

---

## 📋 Requirements

1. **A web platform** where members of the Studyflash team can view tickets and respond to them
2. Tickets can be assignable to individual members of the team
3. Methods to enrich the tickets with user data from Sudyflash (i.e. exceptions in Sentry, Posthog recordings, relevant user data from the Postgres database)
4. Basic AI pipelines that categorize tickets, draft responses and, if needed, assign a ticket to the correct team member.
5. Sending and receiving in a conversation on the support should maintain parity with an Outlook thread. That means a response sent from Outlook should also be visible in the thread in the support platform. Inversely, a response sent from the support platform should be visible in the mail thread on Outlook.

Your final submission should include a runnable web platform. 

---

## 📊 Evaluation

Through this challenge, we are looking to evaluate:

1. **Your ability to build a quick but tangible MVP with limited time**
    - Distill requirements into a minimal application that feels polished and shows clear understanding of both requirements and constraints
2. **Your effective use of AI tooling**
    - Leverage AI assistants, code generation, and automation to accelerate development
3. **Your judgment and prioritization**
    - Quickly grasp what is essential versus secondary
    - Make pragmatic decisions about scope and implementation depth
4. **Your technical grasp**
    - Make sound technical choices (frameworks, languages, libraries, SaaS platforms, low-code tools where appropriate)
    - Demonstrate understanding of when to build versus when to integrate existing solutions

## **📦 Submission**

**Deliverables:**

- **GitHub repo** with a README that includes setup instructions and technical documentation
- **Excalidraw Diagrams** supporting your architecture choices and high-level overview of process flows
- **Loom (≤10 min)** walking through the application and explaining:
    - Your thought process and decision-making rationale
    - Why you chose certain technologies/approaches
    - What you decided against and why
    - Trade-offs you considered

If you have any questions, feel free to contact us at [rajiv@studyflash.ch](mailto:rajiv@studyflash.ch)
