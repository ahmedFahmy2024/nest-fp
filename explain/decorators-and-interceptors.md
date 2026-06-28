# Decorators and Interceptors in This NestJS Project

> Written for someone new to NestJS.  
> Everything here is grounded in the actual code in this repo.

---

## Table of Contents

1. [What is a Decorator?](#1-what-is-a-decorator)
2. [What is an Interceptor?](#2-what-is-an-interceptor)
3. [How They Work Together — The Big Picture](#3-how-they-work-together--the-big-picture)
4. [The ResponseMessage Decorator](#4-the-responsemessage-decorator)
5. [The TransformInterceptor](#5-the-transforminterceptor)
6. [The StandardResponse Shape](#6-the-standardresponse-shape)
7. [How the Interceptor Is Registered — main.ts](#7-how-the-interceptor-is-registered--maints)
8. [What the Reflector Is and Why It's Needed](#8-what-the-reflector-is-and-why-its-needed)
9. [Using ResponseMessage on a Route — A Real Example](#9-using-responsemessage-on-a-route--a-real-example)
10. [What the Response Looks Like](#10-what-the-response-looks-like)
11. [What Happens When You Don't Use the Decorator](#11-what-happens-when-you-dont-use-the-decorator)
12. [The Full Request-to-Response Flow](#12-the-full-request-to-response-flow)
13. [How to Use This in a New Route](#13-how-to-use-this-in-a-new-route)

---

## 1. What is a Decorator?

A **decorator** is a special TypeScript function that you attach to a class, method, property, or parameter using the `@` symbol. It runs at the time the class is *defined* (when the module loads), not when it is *called*.

```typescript
@Controller('user')          // ← decorator on a class
export class UserController {

  @Get(':id')                // ← decorator on a method
  @ResponseMessage('User fetched successfully')  // ← our custom decorator
  findById(@Param('id') id: string) { ... }     // ← decorator on a parameter
}
```

NestJS uses decorators heavily. Most of them do one of two things:

1. **Attach metadata** — stick a label or value onto a class/method so other parts of the framework can read it later.
2. **Register something with the DI container** — tell NestJS "this class is a controller", "this class is injectable", etc.

The decorator in this project (`@ResponseMessage`) does the first thing: it attaches a message string as metadata onto a route handler.

---

## 2. What is an Interceptor?

An **interceptor** sits in the middle of the request-response cycle. Every HTTP request that comes into the app passes *through* the interceptor before the controller runs, and the response passes *through* it again on the way back out.

```
HTTP Request
     ↓
[ Interceptor — "before" logic ]
     ↓
  Controller / Route Handler
     ↓
[ Interceptor — "after" logic, wraps the response ]
     ↓
HTTP Response
```

This makes interceptors ideal for:

- **Transforming responses** — wrapping every controller's return value in a consistent shape (what this project does)
- **Logging** — recording how long every request took
- **Caching** — returning a cached response before the controller even runs
- **Error mapping** — catching exceptions and reshaping them

---

## 3. How They Work Together — The Big Picture

This project uses the decorator and interceptor together to solve one problem:

> **Every API response should have the same shape** — a `statusCode`, a human-readable `message`, and the actual `data`.

The decorator lets you *annotate* a route with a message string. The interceptor *reads* that annotation and wraps the controller's return value in the standard shape.

```
Route Handler (annotated with @ResponseMessage('User fetched successfully'))
       ↓
  returns: { id: '123', name: 'Alice' }
       ↓
TransformInterceptor sees the annotation, reads the message, wraps the data
       ↓
  sends: { statusCode: 200, message: 'User fetched successfully', data: { id: '123', name: 'Alice' } }
```

---

## 4. The ResponseMessage Decorator

**File:** [`src/common/decorators/response-message.decorator.ts`](../src/common/decorators/response-message.decorator.ts)

```typescript
import { SetMetadata } from '@nestjs/common';

export const RESPONSE_MESSAGE_KEY = 'responseMessage';

export const ResponseMessage = (message: string) =>
  SetMetadata(RESPONSE_MESSAGE_KEY, message);
```

This file is tiny — three lines of logic — but there's a lot to understand.

### `SetMetadata`

`SetMetadata` is a NestJS built-in. It returns a decorator that attaches a key-value pair onto whatever it decorates:

```typescript
SetMetadata('responseMessage', 'User fetched successfully')
// attaches the key 'responseMessage' with the value 'User fetched successfully'
// onto the method it's placed on
```

This metadata is invisible at runtime — it doesn't change what the function does. It just sticks a note on the method that other parts of the framework (specifically, the `Reflector`) can read later.

### `RESPONSE_MESSAGE_KEY`

```typescript
export const RESPONSE_MESSAGE_KEY = 'responseMessage';
```

This is just a string constant used as the metadata key. It's exported so the interceptor can import and use the same key when reading the metadata. If both files used a different string, the interceptor would never find the message the decorator stored.

### `ResponseMessage`

```typescript
export const ResponseMessage = (message: string) =>
  SetMetadata(RESPONSE_MESSAGE_KEY, message);
```

This is a **decorator factory** — a function that *returns* a decorator. You call it with a string argument and it produces a decorator:

```typescript
@ResponseMessage('User fetched successfully')
// is exactly the same as:
@SetMetadata('responseMessage', 'User fetched successfully')
```

The factory pattern exists so you can pass arguments to the decorator. Without it, you could only use `@ResponseMessage` with no message, which would be useless.

---

## 5. The TransformInterceptor

**File:** [`src/common/interceptors/transform.interceptor.ts`](../src/common/interceptors/transform.interceptor.ts)

```typescript
import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { RESPONSE_MESSAGE_KEY } from '../decorators/response-message.decorator';
import { Request, Response } from 'express';

export interface StandardResponse<T> {
  statusCode: number;
  message: string;
  data: T;
}

@Injectable()
export class TransformInterceptor<T>
  implements NestInterceptor<T, StandardResponse<T>>
{
  constructor(private readonly reflector: Reflector) {}

  intercept(
    context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<StandardResponse<T>> {
    const message =
      this.reflector.getAllAndOverride<string>(RESPONSE_MESSAGE_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? 'Success';

    const response = context.switchToHttp().getResponse<Response>();

    return next.handle().pipe(
      map((data) => ({
        statusCode: response.statusCode,
        message,
        data,
      })),
    );
  }
}
```

Let's go through this piece by piece.

### `@Injectable()`

Same as with `PrismaService` — this decorator registers the class with NestJS's DI system so it can be instantiated and injected.

### `implements NestInterceptor<T, StandardResponse<T>>`

`NestInterceptor` is an interface NestJS provides. Any class implementing it must have an `intercept()` method. The two generic type parameters say:

- `T` — the type coming *in* (what the controller returns)
- `StandardResponse<T>` — the type going *out* (what the interceptor transforms it into)

This is TypeScript enforcing the contract.

### `constructor(private readonly reflector: Reflector)`

The `Reflector` is the tool NestJS provides for reading metadata that decorators have attached. The interceptor needs it to read the `responseMessage` value off each route handler. NestJS injects it automatically because the class is `@Injectable()`.

### `intercept(context, next)`

This is the method NestJS calls for every request. It receives:

- `context: ExecutionContext` — information about the current request (which handler is being called, what the HTTP request/response objects are, etc.)
- `next: CallHandler` — a handle to the actual route handler. Calling `next.handle()` runs the controller method.

### Reading the metadata

```typescript
const message =
  this.reflector.getAllAndOverride<string>(RESPONSE_MESSAGE_KEY, [
    context.getHandler(),
    context.getClass(),
  ]) ?? 'Success';
```

`getAllAndOverride` reads the metadata stored under `RESPONSE_MESSAGE_KEY`. It checks two places in order:

1. The **method** (`context.getHandler()`) — the specific route handler being called, e.g. `findById`
2. The **class** (`context.getClass()`) — the controller class itself, e.g. `UserController`

If the decorator is on the method, the method's value wins. If only on the class, the class value is used. If neither has the metadata, the result is `undefined`, and the `?? 'Success'` fallback kicks in — the message defaults to `'Success'`.

### Reading the HTTP status code

```typescript
const response = context.switchToHttp().getResponse<Response>();
```

`context.switchToHttp()` switches from NestJS's abstract execution context to the underlying HTTP layer. `.getResponse<Response>()` gives us the Express `Response` object. Later, `response.statusCode` gives us the status code NestJS has set (e.g. `200`, `201`).

### Transforming the response

```typescript
return next.handle().pipe(
  map((data) => ({
    statusCode: response.statusCode,
    message,
    data,
  })),
);
```

`next.handle()` returns an `Observable` — an RxJS stream that emits the controller's return value. `.pipe(map(...))` transforms whatever the controller returns into the standard response shape. This runs *after* the controller finishes.

---

## 6. The StandardResponse Shape

```typescript
export interface StandardResponse<T> {
  statusCode: number;
  message: string;
  data: T;
}
```

This TypeScript interface describes the exact shape of every response this API sends. `T` is a generic — it becomes whatever type the controller actually returns. So for a route that returns a `User`, the full response type is:

```typescript
StandardResponse<User>
// which resolves to:
{
  statusCode: number;
  message: string;
  data: User;
}
```

The interface is exported from the interceptor file so other parts of the codebase can use it for type annotations if needed.

---

## 7. How the Interceptor Is Registered — main.ts

**File:** [`src/main.ts`](../src/main.ts)

```typescript
import { NestFactory, Reflector } from '@nestjs/core';
import { AppModule } from './app.module';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  app.useGlobalInterceptors(new TransformInterceptor(app.get(Reflector)));
  app.enableShutdownHooks();
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
```

### `app.useGlobalInterceptors(...)`

This registers the interceptor **globally** — it runs on every single request to every route in the entire application. You don't have to add it to any controller individually.

### `new TransformInterceptor(app.get(Reflector))`

Because the interceptor is registered at the application level (outside of any module), NestJS can't inject its dependencies automatically. So we:

1. Manually instantiate `TransformInterceptor` with `new`
2. Manually get the `Reflector` from the app's DI container using `app.get(Reflector)` and pass it to the constructor

This is the only place in the project where you'll see manual instantiation like this — it's a NestJS requirement for global interceptors registered in `main.ts`.

---

## 8. What the Reflector Is and Why It's Needed

`Reflector` is a NestJS utility class that reads metadata stored by decorators. It's part of `@nestjs/core`.

When you write `@ResponseMessage('User fetched successfully')` on a route handler, that string is stored in TypeScript's metadata system (via `Reflect.defineMetadata` under the hood). It's not stored in any variable you can directly access from the interceptor — you need the `Reflector` to retrieve it.

```
@ResponseMessage('User fetched successfully')  →  stores metadata on the handler
                                                        ↓
                                                 (invisible at runtime)
                                                        ↓
TransformInterceptor uses Reflector  →  reads metadata from the handler
```

Without the `Reflector`, the interceptor would have no way to know which message to use for which route. The `Reflector` is the bridge between the decorator (which runs at class-definition time) and the interceptor (which runs at request time).

---

## 9. Using ResponseMessage on a Route — A Real Example

**File:** [`src/module/user/user.controller.ts`](../src/module/user/user.controller.ts)

```typescript
import { Controller, Get, Param } from '@nestjs/common';
import { Roles } from '@thallesp/nestjs-better-auth';
import { UserService } from './user.service';
import { ResponseMessage } from 'src/common/decorators/response-message.decorator';

@Controller('user')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get('all')
  @Roles(['ADMIN'])
  findAll() {
    return this.userService.findAll();
  }

  @Get(':id')
  @ResponseMessage('User fetched successfully')  // ← the decorator in use
  findById(@Param('id') id: string) {
    return this.userService.findById(id);
  }
}
```

Notice:

- `findAll()` has **no** `@ResponseMessage`. The interceptor will fall back to `'Success'`.
- `findById()` has `@ResponseMessage('User fetched successfully')`. The interceptor will read this string.

The decorator is placed on the *method*, right above the `@Get(':id')`. Order between `@Get` and `@ResponseMessage` doesn't matter — both just attach metadata.

---

## 10. What the Response Looks Like

### `GET /user/:id` — with `@ResponseMessage`

The controller returns the user object directly:

```typescript
return this.userService.findById(id);
// returns: { id: '123', name: 'Alice', email: 'alice@example.com', ... }
```

The interceptor wraps it:

```json
{
  "statusCode": 200,
  "message": "User fetched successfully",
  "data": {
    "id": "123",
    "name": "Alice",
    "email": "alice@example.com"
  }
}
```

### `GET /user/all` — without `@ResponseMessage`

```json
{
  "statusCode": 200,
  "message": "Success",
  "data": [
    { "id": "123", "name": "Alice", ... },
    { "id": "456", "name": "Bob", ... }
  ]
}
```

In both cases the controller code itself stays simple — it just returns data. The wrapping happens automatically.

---

## 11. What Happens When You Don't Use the Decorator

Without `@ResponseMessage`, the `Reflector` finds no metadata on the handler or the class, so `getAllAndOverride` returns `undefined`. The `?? 'Success'` nullish coalescing operator catches this and uses `'Success'` as the default:

```typescript
const message =
  this.reflector.getAllAndOverride<string>(RESPONSE_MESSAGE_KEY, [
    context.getHandler(),
    context.getClass(),
  ]) ?? 'Success';
//    ↑ if getAllAndOverride returns undefined or null, use 'Success'
```

So `@ResponseMessage` is entirely optional. The interceptor always runs, always wraps, always produces a standard shape — you just choose whether to customize the message string.

---

## 12. The Full Request-to-Response Flow

Here is what happens from the moment an HTTP request arrives to the moment a response is sent back:

```
Client sends: GET /user/abc123
      ↓
NestJS routes the request to UserController.findById
      ↓
TransformInterceptor.intercept() is called (BEFORE the handler runs)
      ↓
Reflector reads @ResponseMessage metadata from findById:
  → finds 'User fetched successfully'
      ↓
context.switchToHttp().getResponse() grabs the Express response object
      ↓
next.handle() is called — UserController.findById() executes:
  → calls UserService.findById('abc123')
  → UserService calls PrismaService.user.findUnique(...)
  → Prisma runs: SELECT ... FROM "user" WHERE id = 'abc123'
  → returns: { id: 'abc123', name: 'Alice', ... }
      ↓
The Observable emits the return value
      ↓
map() inside the interceptor transforms it:
  → { statusCode: 200, message: 'User fetched successfully', data: { id: 'abc123', ... } }
      ↓
Client receives:
  {
    "statusCode": 200,
    "message": "User fetched successfully",
    "data": { "id": "abc123", "name": "Alice", ... }
  }
```

---

## 13. How to Use This in a New Route

When you add a new controller method, you have two choices:

**Option A — use the default message `'Success'`:** just return your data and do nothing else.

```typescript
@Get()
findAll() {
  return this.myService.findAll();
  // response: { statusCode: 200, message: 'Success', data: [...] }
}
```

**Option B — customize the message:**

```typescript
import { ResponseMessage } from 'src/common/decorators/response-message.decorator';

@Post()
@ResponseMessage('Item created successfully')
create(@Body() dto: CreateItemDto) {
  return this.myService.create(dto);
  // response: { statusCode: 201, message: 'Item created successfully', data: { ... } }
}
```

That's all you need to do. The interceptor handles the rest automatically — you never need to manually build `{ statusCode, message, data }` in your controller.

---

## Quick Reference

| File | Role |
|------|------|
| `src/common/decorators/response-message.decorator.ts` | Defines `@ResponseMessage(message)` — attaches a message string as metadata onto a route handler |
| `src/common/interceptors/transform.interceptor.ts` | Reads that metadata and wraps every response in `{ statusCode, message, data }` |
| `src/main.ts` | Registers the interceptor globally with `app.useGlobalInterceptors(...)` |

| Concept | What it does |
|---------|-------------|
| `SetMetadata(key, value)` | NestJS built-in that stores a value as metadata on a class or method |
| `Reflector` | NestJS utility that reads metadata stored by decorators at request time |
| `ExecutionContext` | Provides access to the current request, response, handler, and class inside an interceptor |
| `next.handle()` | Calls the actual route handler; returns an Observable you can pipe and transform |
| `map()` | RxJS operator that transforms each emitted value — here it wraps the controller's return value |
| `getAllAndOverride` | Reads metadata, checking the method first then the class; returns the first match found |
