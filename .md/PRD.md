# Product Requirements Document

## Product
Local Habit Tracker

## Problem
Standard habit trackers force daily completion, punishing users for planned rest days and causing timezone synchronization bugs when deployed to the cloud.

## Target Users
Individual users wanting a private, offline-first productivity tool.

## Goal
Create a centralized, local-only habit tracking dashboard with advanced frequency scheduling.

## Core Features
1. Dashboard view of today's habits
2. Custom habit frequency rules (Daily, Specific Days, Interval)
3. Historical logging and streak tracking
4. Local PostgreSQL data persistence

## MVP
- Dashboard UI
- Create/Edit/Delete habits
- Mark habits complete/incomplete
- Frequency rule engine

## Out of Scope
- Cloud deployment
- Multi-user authentication
- Social sharing

## Success Criteria
A user should be able to:
1. View only habits due on the current day
2. Set a habit for specific weekdays without losing streaks on off-days
3. Log offline without timezone mismatch bugs