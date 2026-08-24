# Tanker Logix - Professional Trucking Rate Calculator

## Overview

Tanker Logix is a sophisticated web application designed specifically for the crude oil and diesel trucking industry. Built with a sleek metallic theme that reflects industrial strength and reliability, the platform empowers logistics professionals to make data-driven pricing decisions quickly and accurately.

The application combines real-time route optimization with comprehensive rate calculation, helping trucking operators maximize profitability while maintaining competitive pricing. With its distinctive steel and chrome aesthetic, Tanker Logix represents the perfect blend of industrial functionality and modern technology.

## Key Features

### Core Functionality
- **Multi-Route Analysis**: Analyzes up to 3 alternative routes using Google Maps API for optimal path selection
- **Dual Load Type Support**: Specialized calculations for both crude oil and diesel hauling with appropriate rate adjustments
- **Custom Speed Controls**: Configure different speeds for highways, state roads, and local roads to accurately reflect real-world driving conditions
- **Target Earnings Optimization**: Set hourly rate targets and see suggested pricing to meet revenue goals
- **Batch Processing**: Upload spreadsheets with multiple locations for bulk rate calculations

### Business Tools
- **Location Management**: Maintain a comprehensive database of pickup and delivery locations
- **Scenario Planning**: Save and compare different route and pricing scenarios for strategic decision-making
- **Override Rules**: Apply custom pricing adjustments based on specific business rules or contractual agreements
- **Rate Calculation History**: Track and analyze historical calculations for pricing trends

### User Experience
- **Metallic Design Theme**: Professional steel and chrome color palette with gradient accents reflecting industrial strength
- **Responsive Interface**: Fully optimized for desktop, tablet, and mobile devices
- **Interactive Route Mapping**: Visual route display with turn-by-turn navigation details
- **Real-Time Updates**: Instant recalculation as parameters change

## Technical Highlights

### Security & Performance
- **API Key Protection**: Google Maps API keys secured server-side, never exposed to client
- **Route Caching**: Intelligent caching system reduces API calls and improves response times
- **Optimized Data Storage**: Efficient JSON-based storage with migration-ready architecture

### Modern Stack
- **Frontend**: React 18 + TypeScript + Vite for blazing-fast performance
- **UI Framework**: Tailwind CSS with custom metallic theme variables
- **Backend**: Express.js with comprehensive error handling
- **State Management**: TanStack Query for efficient data synchronization

## Branding & Design

The Tanker Logix brand embodies industrial strength and technological precision:

- **Color Palette**: Metallic grays, steel blues, and chrome accents
- **Typography**: Clean, modern fonts optimized for readability
- **Visual Elements**: Gradient overlays and subtle animations that evoke liquid movement
- **Logo**: Industrial tanker truck icon with modern geometric styling

## User Preferences

Preferred communication style: Simple, everyday language with industry-appropriate terminology.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript and Vite for fast development and builds
- **UI Components**: Shadcn/ui component library with custom metallic theme styling
- **State Management**: TanStack Query for server state and caching, with local component state for UI
- **Routing**: Wouter for lightweight client-side routing
- **Build System**: Vite with ESM modules, optimized for development and production

### Backend Architecture  
- **Runtime**: Node.js with Express server
- **Data Storage**: JSON file-based storage in `/data` directory with interface designed for future database migration
- **File Processing**: Multer for file uploads with XLSX parsing for spreadsheet imports
- **API Design**: RESTful endpoints under `/api` prefix with comprehensive error handling
- **Security**: Google Maps API key stored server-side in environment variables, never exposed to client

### Data Storage Solutions
- **Current**: JSON file storage with structured interfaces (locations.json, config.json, scenarios.json, overrides.json)
- **Future Ready**: Storage abstraction layer (IStorage interface) enables seamless migration to SQLite or PostgreSQL
- **Caching**: Route cache for Google Maps API responses to minimize API calls and costs
- **File Structure**: Organized data directory with separate files for different entity types

### Authentication and Authorization
- **Current State**: No authentication system implemented (single-user application)
- **Security Focus**: API key protection through server-side proxy pattern
- **Session Handling**: Basic session infrastructure present for future expansion

### External Service Integrations
- **Google Maps API**: Core integration for route calculation and mapping
  - Server-side proxy to protect API keys
  - Route caching to optimize API usage
  - Multiple route alternatives support
  - Distance, duration, and polyline data extraction
- **File Upload Processing**: XLSX and CSV file parsing for bulk location imports
- **Future Integrations**: Designed to support additional mapping services, fuel price APIs, and trucking compliance systems

## Recent Updates

- **December 2024**: Complete rebrand to Tanker Logix with metallic theme implementation
- **January 2025**: Enhanced route optimization and batch processing capabilities
- **January 2025**: Improved mobile responsiveness and touch interactions
- **January 2025**: Added comprehensive SEO optimization and social sharing support