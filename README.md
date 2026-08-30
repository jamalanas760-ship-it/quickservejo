# QuickServe

MASTER PRODUCTION PROMPT — QUICK SERVE

Multi-Tenant QR Restaurant Ordering SaaS

Build a production-ready, commercial, multi-tenant SaaS platform called QuickServe for restaurants, cafés, food courts, and similar businesses.

This is NOT a prototype, landing page, or simple restaurant menu.

The goal is to build a real SaaS product that I can sell to multiple restaurant customers as a subscription service, where I remain the platform owner and can create, configure, manage, support, and monitor every restaurant from a central Super Admin Panel.

The system must be designed from the beginning for:

Multiple restaurants

Multiple staff members per restaurant

Multiple tables per restaurant

Multiple menus/categories/products

QR-code ordering

Real-time kitchen management

Waiter calls

Cashier management

Restaurant analytics

Restaurant customization

Arabic + English

RTL + LTR

AI-assisted design/content

Strong security

Row Level Security

Real-time updates

Future subscription/billing support

Easy non-technical administration

Scalability

Do NOT build everything as one hard-coded restaurant.

Every restaurant must be a separate tenant while using the same application/codebase.



1. CORE PRODUCT ARCHITECTURE

Build three connected applications inside the same platform:

APP 1 — CUSTOMER QR ORDERING

Customers scan a QR code at a restaurant table and immediately see that restaurant’s menu.

No customer account/login should be required.

Customer flow:

QR Scan
→ Restaurant Menu
→ Categories
→ Product
→ Modifiers
→ Cart
→ Checkout
→ Order Confirmation
→ Live Order Status



APP 2 — RESTAURANT STAFF SYSTEM

Authenticated restaurant employees use a dedicated staff interface.

Different employees see different functionality depending on their role.

Roles:

Restaurant Admin

Kitchen

Waiter

Cashier

Manager



APP 3 — PLATFORM SUPER ADMIN

I am the SaaS platform owner.

I need complete control over all restaurants.

The Super Admin should be able to:

Create restaurants

Edit restaurants

Activate/deactivate restaurants

Configure restaurants

Add products

Add categories

Upload images

Edit descriptions

Edit addresses

Edit colors

Edit fonts

Edit layouts

Create tables

Generate QR codes

Manage staff

View orders

View analytics

Impersonate/access restaurant management

Manage subscription status

View platform-wide analytics

The Super Admin must be able to completely onboard a restaurant without requiring the restaurant owner to understand databases or technical concepts.



2. TECHNOLOGY STACK

Use:

React

TypeScript

Vite

Tailwind CSS

Modern component architecture

Supabase

PostgreSQL

Supabase Authentication

Supabase Realtime

Supabase Storage

PostgreSQL RLS

Edge Functions where appropriate

PWA architecture

Use a clean, scalable folder structure.

Do NOT create one huge component.

Use reusable components, hooks, services, utilities and database functions.

The architecture must be maintainable by another developer.



3. MULTI-TENANT ARCHITECTURE

This is one of the most important requirements.

Every restaurant is a separate tenant.

Every tenant-owned record must contain:

restaurant_id

Examples:

categories

menu items

modifiers

tables

orders

order items

staff

waiter calls

settings

analytics-related records

Never rely only on frontend filtering for tenant isolation.

Tenant security MUST be enforced using PostgreSQL Row Level Security.

A restaurant user must NEVER be able to access another restaurant’s data by changing:

URL

restaurant slug

ID

API request

browser developer tools

request payload

The database must enforce tenant isolation.



4. DATABASE

Create a professional PostgreSQL schema.

restaurants

Fields:

id

name

slug

logo_url

cover_image_url

description_ar

description_en

phone

email

address_ar

address_en

latitude

longitude

primary_color

secondary_color

accent_color

background_color

text_color

font_family

layout_style

card_style

menu_style

currency

tax_rate

service_charge

timezone

is_active

subscription_plan

subscription_status

created_at

updated_at



restaurant_settings

Store configurable restaurant settings separately when appropriate.

Examples:

enable_orders

enable_waiter_calls

enable_cashier

enable_kitchen_display

enable_reviews

enable_tips

enable_service_charge

show_prices

allow_special_notes

sound_notifications

order_auto_accept

minimum_order

estimated_preparation_time



tables

Fields:

id

restaurant_id

table_number

table_name

qr_code_url

qr_token

is_active

created_at

QR codes must identify:

restaurant + table

Do NOT expose sensitive database IDs unnecessarily.



menu_categories

Fields:

id

restaurant_id

name_ar

name_en

description_ar

description_en

image_url

display_order

is_active

created_at

updated_at



menu_items

Fields:

id

restaurant_id

category_id

name_ar

name_en

description_ar

description_en

price

compare_at_price

image_url

is_available

is_featured

display_order

preparation_time

created_at

updated_at



item_modifiers

Fields:

id

restaurant_id

menu_item_id

name_ar

name_en

price_delta

is_required

min_selection

max_selection

display_order

is_active

Support modifier groups such as:

Size:

Small

Medium

Large

Extras:

Cheese

Sauce

Extra Chicken



orders

Fields:

id

restaurant_id

table_id

order_number

status

payment_status

subtotal

tax_amount

service_amount

discount_amount

total

customer_notes

created_at

updated_at

Order statuses:

new

accepted

preparing

ready

served

paid

cancelled



order_items

Fields:

id

restaurant_id

order_id

menu_item_id

product_name_snapshot_ar

product_name_snapshot_en

quantity

unit_price

notes

selected_modifiers

total_price

IMPORTANT:

Store product name and price snapshots in the order.

If the restaurant changes the menu price later, old orders must NOT change.



staff

Fields:

id

restaurant_id

auth_user_id

name

email

role

is_active

created_at

Roles:

super_admin

restaurant_admin

manager

kitchen

waiter

cashier



waiter_calls

Fields:

id

restaurant_id

table_id

status

created_at

acknowledged_at

resolved_at



audit_logs

Create an audit system.

Track important actions:

who performed the action

restaurant

action

entity

entity_id

timestamp

metadata

Examples:

“Admin changed menu price”

“Staff marked order as paid”

“Super Admin created restaurant”



5. SECURITY

Implement strong Supabase RLS.

Policies must ensure:

Customer

Can only read public active restaurant menu data.

Customers must NOT access:

staff information

internal settings

other restaurant data

financial reports

private customer data

Restaurant Staff

Can only access their own restaurant.

Restaurant Admin

Can manage their restaurant.

Super Admin

Can access all restaurants.

Never trust role information coming only from the frontend.

Authorization must be verified server-side/database-side.



6. CUSTOMER EXPERIENCE

Route:

/order/:restaurantSlug/:tableToken

The customer should immediately see:

Restaurant logo

Restaurant name

Optional cover image

Categories

Products

Cart

Language switcher

No login.

The customer experience should be extremely simple.

Target:

Scan → Choose → Order



7. RESTAURANT MENU DESIGN ENGINE

Do NOT use one fixed template for every restaurant.

Create a reusable Restaurant Design Engine.

Each restaurant should have stored design settings.

Example:

Restaurant A:

dark background

gold accents

elegant typography

large food images

rounded cards

Restaurant B:

white background

pastel colors

minimalist layout

compact cards

Restaurant C:

bold colors

magazine layout

large category images

All restaurants use the same underlying code but look significantly different.

Support:

Layouts

Grid

List

Magazine

Compact

Premium

Card styles

Rounded

Sharp

Elevated

Minimal

Image-first

Themes

Light

Dark

Auto

Use CSS variables/design tokens rather than hard-coded colors.



8. CUSTOMER MENU FEATURES

Implement:

Category navigation

Search

Featured products

Product cards

Product details

Large product images

Quantity selector

Modifiers

Required modifiers

Optional modifiers

Special instructions

Add to cart

Edit cart

Remove item

Clear cart

Persistent cart

Order summary

Tax

Service charge

Discount support architecture

Total

Do NOT force customers to create accounts.



9. CART

Cart must remain available while navigating the menu.

Display:

Product

Quantity

Modifiers

Unit price

Total price

Allow:

Increase quantity

Decrease quantity

Edit item

Delete item

Show a floating/mobile cart button.



10. CHECKOUT

Checkout must clearly display:

Subtotal

Tax

Service charge

Discount

Final total

Allow:

Customer notes

Table information

Order confirmation

Do not trust totals calculated by the browser.

Server/database logic must calculate the final authoritative total.



11. ORDER CONFIRMATION

After placing the order:

Show:

Order number

Table

Total

Items

Estimated preparation time

Live order status

Status tracker:

NEW
↓
ACCEPTED
↓
PREPARING
↓
READY
↓
SERVED

Use Supabase Realtime.

No manual refresh.



12. CALL WAITER

Always-visible button:

Call Waiter

Customer clicks it.

Create a waiter call.

Show confirmation:

“Waiter has been notified.”

Prevent accidental spam.

Implement reasonable cooldown/debouncing.

Staff receives real-time notification.



13. KITCHEN DISPLAY SYSTEM

Create a dedicated KDS.

Route:

/staff/:restaurantSlug/kitchen

Kitchen screen must be optimized for:

tablet

desktop

wall-mounted display

Show order cards.

Each card:

order number

table

time

items

quantities

modifiers

notes

elapsed time

status

Actions:

Accept
→ Preparing
→ Ready

New orders must appear automatically through Realtime.

Visual alert + optional sound.

Use clear urgency indicators.



14. WAITER APP

Route:

/staff/:restaurantSlug/waiter

Display:

active tables

pending waiter calls

ready orders

served orders

table status

Waiter calls should be highly visible.

Actions:

Acknowledge
Resolve

Real-time updates.



15. CASHIER

Route:

/staff/:restaurantSlug/cashier

Show:

active orders

table

order number

subtotal

tax

service

total

payment status

Actions:

Mark as paid.

Prevent duplicate payment state transitions.



16. RESTAURANT ADMIN DASHBOARD

This is extremely important.

The restaurant owner is NOT technical.

Do not show database tables.

Do not show JSON.

Do not show technical IDs.

Create a beautiful SaaS dashboard.

Main navigation:

Dashboard

Orders

Menu

Categories

Tables & QR

Staff

Analytics

Restaurant Appearance

Settings



17. MENU MANAGEMENT

Restaurant admin must be able to:

Create category

Edit category

Delete category

Reorder categories

Create product

Edit product

Delete product

Upload product image

Change price

Set availability

Mark featured

Add description

Add modifiers

Reorder products

Everything must be done through simple forms.

Support drag-and-drop ordering where appropriate.



18. IMAGE MANAGEMENT

Use Supabase Storage.

Restaurant admin can upload:

Logo

Cover image

Category images

Product images

Optimize images.

Generate appropriate sizes.

Avoid unnecessarily huge images.

Use responsive image loading.

Show previews.

Allow replacement/deletion.



19. TABLE & QR MANAGEMENT

Restaurant admin can:

Create table

Edit table

Delete/deactivate table

Generate QR

Download QR

Print QR

Generate QR cards for multiple tables.

Example:

Table 1
QR

Table 2
QR

Table 3
QR

Each QR must open the correct restaurant/table menu.



20. RESTAURANT APPEARANCE BUILDER

Create a visual customization page.

Restaurant owner can modify:

Primary color

Secondary color

Accent color

Background

Text color

Font

Menu layout

Card style

Button style

Theme

Display options

Show a live preview while editing.

Save changes and apply them immediately.



21. AI DESIGN ASSISTANT

Add:

“Describe your restaurant design”

Input accepts:

Arabic OR English.

Examples:

“مطعم فاخر بألوان أسود وذهبي وتصميم راقي”

or

“Modern minimalist coffee shop with pastel colors”

AI must return structured JSON such as:

{
“primary_color”: “…”,
“secondary_color”: “…”,
“accent_color”: “…”,
“background_color”: “…”,
“text_color”: “…”,
“font_family”: “…”,
“layout_style”: “…”,
“card_style”: “…”,
“theme”: “…”
}

The AI must NOT directly modify the database without validation.

Validate the AI response against a strict schema.

Then save approved design tokens.

The system must understand both Arabic and English naturally.



22. AI MENU CONTENT ASSISTANT

Also create an optional AI assistant for restaurant owners.

Examples:

Input:

“برجر دجاج مع جبنة شيدر وصوص خاص”

The AI can generate:

Arabic product name

English product name

Arabic description

English description

Suggested category

Suggested price range

Suggested modifiers

The owner must review before saving.

Never automatically publish AI-generated content without confirmation.



23. BILINGUAL SYSTEM

Everything must support:

Arabic

English

Every restaurant content field should support Arabic + English.

Examples:

Product name AR

Product name EN

Description AR

Description EN

Category AR

Category EN

Restaurant description AR

Restaurant description EN

Arabic:

RTL

English:

LTR

Language switching must work throughout the entire system.

Remember the customer’s selected language.



24. SUPER ADMIN DASHBOARD

Route:

/super-admin

This is my platform management center.

Dashboard cards:

Total restaurants

Active restaurants

Inactive restaurants

Orders today

Orders this week

Revenue/GMV architecture

Active tables

Active staff



25. RESTAURANT MANAGEMENT

Super Admin can:

Create restaurant

Edit restaurant

Deactivate restaurant

Reactivate restaurant

Delete/archive restaurant

Open restaurant dashboard

Manage menu

Manage categories

Manage products

Upload images

Edit address

Edit description

Change colors

Change fonts

Change layout

Manage tables

Generate QR codes

Manage staff

View orders

View analytics



26. RESTAURANT ONBOARDING

Create an extremely simple onboarding flow.

Example:

STEP 1
Restaurant name

STEP 2
Logo

STEP 3
Address

STEP 4
Language

STEP 5
Currency

STEP 6
Tax/service settings

STEP 7
Choose design

STEP 8
Create tables

STEP 9
Generate QR codes

STEP 10
Add menu

STEP 11
Publish

Show progress.

The goal is to onboard a restaurant in minutes.



27. SUPER ADMIN “MANAGE RESTAURANT” MODE

I need the ability to select a restaurant and enter its management environment.

For example:

Super Admin
→ Restaurants
→ Restaurant A
→ Manage

From there I should be able to manage the restaurant exactly as its admin would.

This is important for customer support and onboarding.

Do NOT duplicate the entire application unnecessarily.

Use a secure role-aware management context.



28. RESTAURANT ANALYTICS

Dashboard should show:

Today’s orders

Today’s sales

Orders this week

Orders this month

Average order value

Top products

Top categories

Peak ordering hours

Orders by status

Cancelled orders

Table activity

Use clean charts.

Do not overwhelm restaurant owners.

Use simple explanations.



29. SEARCH

Customer menu search should be fast.

Search:

Product name

Arabic name

English name

Description

Category

Results should update quickly.

Support Arabic search properly.



30. REAL-TIME SYSTEM

Use Supabase Realtime for:

New orders

Order status changes

Waiter calls

Payment updates

Kitchen updates

Staff notifications

Dashboard activity

Do not require manual refresh.



31. NOTIFICATION SYSTEM

Build an internal notification architecture.

Support:

In-app notifications

Sound notifications

Visual alerts

Unread count

Notification history

Notification preferences

Prepare architecture for future:

Browser push notifications

Mobile push notifications



32. PWA

Make the platform PWA-ready.

Customer app:

installable

fast loading

responsive

offline menu cache where technically appropriate

Staff app:

optimized for tablets

installable

fast launch

Do NOT allow offline mode to create conflicting orders.

If network connectivity is lost, clearly show:

“Connection lost”

and prevent unsafe order submission until connection is restored or safely synchronized.



33. PERFORMANCE

Prioritize real restaurant Wi-Fi and low/mid-range phones.

Optimize:

Images

Database queries

Realtime subscriptions

Rendering

Bundle size

Caching

Avoid unnecessary API requests.

Use pagination for large datasets.

Use indexes for:

restaurant_id

category_id

order status

created_at

table_id

slug

auth_user_id



34. ERROR HANDLING

Every page must have:

Loading state

Empty state

Error state

Success state

Network error state

Unauthorized state

Not found state

Do not leave blank screens.

Errors must be understandable to non-technical users.

Never expose raw database errors to restaurant owners.



35. RESPONSIVE DESIGN

Customer:

Mobile-first.

Staff:

Mobile + tablet + desktop.

Super Admin:

Desktop + tablet.

Everything must work correctly on:

iPhone

Android

Tablet

Laptop

Desktop



36. PROFESSIONAL DESIGN SYSTEM

Create a consistent design system.

Use:

modern typography

clear hierarchy

subtle animations

polished cards

professional tables

clean forms

accessible buttons

consistent spacing

responsive layouts

skeleton loading

toast notifications

modal dialogs

confirmation dialogs

Do not make it look like a generic AI-generated dashboard.

The product should look like a serious commercial SaaS company.

Aim for the polish level of modern products such as:

Stripe

Square

Toast

Shopify

Linear

but DO NOT copy their designs.

Create an original QuickServe visual identity.



37. ACCESSIBILITY

Implement:

keyboard navigation

readable contrast

accessible buttons

labels for form fields

focus states

screen-reader-friendly controls

appropriate touch target sizes



38. SUBSCRIPTION ARCHITECTURE

Even if payment subscriptions are not implemented in the first version, design the database architecture for future SaaS billing.

Plans:

Free

Basic

Professional

Enterprise

Store:

subscription_plan

subscription_status

subscription_start

subscription_end

limits

Prepare the architecture for future Stripe integration.

Do not hard-code subscription limits throughout the frontend.

Create a centralized permissions/feature-limit system.



39. FEATURE LIMITS

Prepare support for limits such as:

Maximum tables

Maximum products

Maximum staff

Maximum monthly orders

Analytics availability

Custom branding

AI features

Advanced features

The Super Admin must be able to see the current plan and limits.



40. AUDIT & SECURITY

Log sensitive actions.

Examples:

Restaurant created

Restaurant deactivated

Product created

Product deleted

Price changed

Staff created

Staff removed

Order cancelled

Payment marked paid

Super Admin accessed restaurant

Use audit logs.



41. DEMO / SEED DATA

Create at least 3 realistic demo restaurants.

Restaurant 1:

Luxury restaurant

Dark + gold

Premium layout

Restaurant 2:

Modern café

Light + pastel

Minimal layout

Restaurant 3:

Casual burger restaurant

Bold colors

Large product images

Each demo restaurant must have:

Categories

Products

Images/placeholders

Tables

QR codes

Staff

Orders

Different design configurations.

This is required to verify the multi-tenant architecture.



42. TESTING

Before considering the system complete, test:

Customer ordering

Cart

Modifiers

Checkout

Order creation

Kitchen

Waiter

Cashier

Restaurant admin

Super Admin

QR codes

Arabic

English

RTL

Realtime

RLS

Multiple restaurants

Multiple staff roles

Image uploads

Design customization

AI design input

AI menu content

Mobile responsiveness

Network failures

Empty states

Error states

Permissions

Make sure Restaurant A cannot access Restaurant B.

This is a critical acceptance test.



43. IMPORTANT SECURITY TEST

Create test users:

Restaurant A Admin

Restaurant B Admin

Kitchen A

Kitchen B

Super Admin

Verify:

Restaurant A → only Restaurant A data

Restaurant B → only Restaurant B data

Kitchen A → only Restaurant A kitchen

Kitchen B → only Restaurant B kitchen

Super Admin → all restaurants

Attempt unauthorized access through URL/API/database queries and ensure RLS blocks it.



44. DATA OWNERSHIP

The restaurant data must remain stored in my Supabase project/database.

I, as platform owner, must retain control over:

Restaurants

Menus

Products

Images

Tables

Orders

Staff

Settings

Design configurations

Analytics

Audit logs

The restaurant customer should only receive access to their tenant.

Do NOT create separate databases for every restaurant unless there is a future architectural reason.

Use a centralized PostgreSQL database with strong tenant isolation.



45. ADMIN UX PRINCIPLE

The restaurant owner should NEVER need to know:

SQL

PostgreSQL

Supabase

RLS

JSON

API

Database IDs

Technical configuration

Everything should feel like:

“Create Product”

“Upload Image”

“Change Price”

“Generate QR”

“Change Colors”

“Add Employee”

“View Sales”

Not:

“Insert row”

“Update database”



46. EMPTY RESTAURANT EXPERIENCE

If a new restaurant has no menu:

Show a friendly onboarding screen.

Example:

“Let’s build your menu”

Buttons:

Add Category

Add Product

Import Menu

Use AI to create menu

Generate Tables

Customize Design



47. BULK MENU MANAGEMENT

Prepare support for future bulk operations.

Allow restaurant admin/super admin to eventually:

Import menu

Export menu

Bulk update prices

Bulk enable/disable products

Bulk upload images

Do not require this to be fully implemented if it would compromise the core system, but structure the architecture to support it.



48. IMPORT / EXPORT ARCHITECTURE

Prepare the system for CSV/Excel menu import.

Expected columns:

Category

Product AR

Product EN

Description AR

Description EN

Price

Available

Featured

The system should validate imported data before saving.



49. PLATFORM CONFIGURATION

Super Admin should have a platform settings section.

Prepare configuration for:

Platform name

Logo

Default currency

Default language

Default theme

Default tax

Default restaurant settings

Subscription plans

Feature flags

AI settings



50. ENVIRONMENT VARIABLES

Never expose secret keys.

Use environment variables for:

Supabase URL

Supabase anon key

AI API configuration

Future payment provider keys

Any server-side secret must remain server-side.



51. AI ARCHITECTURE

Do NOT put private AI API keys in frontend code.

Use secure Edge Functions/server-side functions.

Validate AI output.

Use structured schemas.

Handle:

AI timeout

Invalid JSON

AI unavailable

Rate limit

Unexpected output

Provide a fallback experience.

The application must continue working even if AI is unavailable.



52. CODE QUALITY

Use:

Reusable components

Reusable hooks

Type-safe database types

Centralized constants

Centralized permission logic

Centralized design tokens

Clear service layer

Clear API/Edge Function layer

No duplicated business logic.

No giant components.

No unnecessary dependencies.

No fake data in production paths.



53. IMPORTANT: DO NOT FAKE FEATURES

Do not create buttons that only visually work.

If a feature is shown as implemented, it must actually work.

No fake:

QR generation

Orders

Realtime

Authentication

RLS

AI

Analytics

Image upload

Role permissions

Database operations



54. DEVELOPMENT PHASES

Do NOT attempt to blindly generate the entire application in one uncontrolled implementation.

Build it in controlled phases.

PHASE 1

Foundation:

Supabase connection

Database

RLS

Authentication

Multi-tenancy

Roles

Core architecture

PHASE 2

Super Admin:

Restaurant creation

Restaurant management

Tenant management

Staff management

Platform dashboard

PHASE 3

Restaurant Admin:

Categories

Products

Modifiers

Images

Tables

QR codes

PHASE 4

Customer:

QR menu

Search

Product details

Cart

Checkout

Order creation

PHASE 5

Staff:

Kitchen

Waiter

Cashier

Realtime

PHASE 6

Customization:

Design engine

Themes

Fonts

Layouts

Live preview

PHASE 7

AI:

AI design assistant

AI menu content assistant

PHASE 8

Analytics:

Sales

Orders

Products

Peak hours

Tables

PHASE 9

PWA + performance

PHASE 10

Testing + security + production hardening

Do not skip earlier phases to build flashy UI.



55. ACCEPTANCE CRITERIA

The project is NOT complete just because pages exist.

Consider the project complete only when:

I can create Restaurant A.

I can create Restaurant B.

Each restaurant has different branding.

Each restaurant has different menus.

Each restaurant has different tables.

Each table has a working QR code.

Customer scans Restaurant A Table 1 QR.

Customer sees Restaurant A menu.

Customer creates an order.

Restaurant A kitchen receives it in real time.

Restaurant A waiter receives waiter calls.

Restaurant A cashier can mark orders paid.

Restaurant B cannot see Restaurant A data.

Restaurant A cannot see Restaurant B data.

Super Admin can manage both.

Arabic works correctly.

English works correctly.

RTL/LTR work correctly.

Design changes apply dynamically.

Images are stored correctly.

Order totals are authoritative server-side.

Errors are handled gracefully.

The application works on mobile.

The application works on tablets.

The application is installable as a PWA.

AI design input works in Arabic and English.

AI failure does not break the application.

Demo restaurants prove true multi-tenancy.



56. FINAL PRODUCT PRINCIPLE

Think of QuickServe as a real SaaS business, not a restaurant website.

The platform owner should be able to onboard a new restaurant in minutes.

The restaurant owner should be able to operate the entire system without technical knowledge.

The customer should be able to scan a QR code and order in seconds.

The kitchen should receive orders instantly.

The waiter should receive calls instantly.

The cashier should manage payments easily.

The Super Admin should have complete platform visibility and control.

The architecture must be secure, scalable, maintainable and ready for future commercial subscription plans.

Prioritize functionality, security, multi-tenancy, data integrity and usability before visual effects.

Build the foundation correctly first, then progressively improve the UI and advanced features.

Do not remove requirements from this specification.

If a requirement cannot safely be implemented in the current phase, create the correct architecture/interface for it and clearly identify it as a future implementation instead of creating a fake feature.

Start with PHASE 1 — FOUNDATION, DATABASE, AUTHENTICATION, MULTI-TENANCY AND RLS.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://quickservejo.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/38b36e4a-7b29-4551-a03b-26761bb8a907).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
