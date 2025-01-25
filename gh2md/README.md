# gh2md

This Node.js script exports GitHub activity for a specified date range and converts it into Markdown files. It uses the GitHub API to fetch your activity including pull requests, commits, issues, and starred repositories, formatting them into a readable Markdown document that summarizes your contributions.

## Prerequisites

1. Create a GitHub Personal Access Token:

   - Go to [GitHub Settings](https://github.com/settings/tokens)
   - Click "Generate new token (classic)"
   - Enable the following scopes:
     - `repo` (for accessing private repository data)
     - `user` (for accessing user activity data)
   - Copy the generated token

2. Set required environment variables:

```bash
export GITHUB_TOKEN=your_personal_access_token
export GITHUB_USERNAME=your_github_username
```

## Installation

For now, you'll have to install gh2md from the GitHub repository:

```bash
$ git clone git://github.com/aldesantis/toolbox.git
$ cd gh2md
$ npm install
$ chmod +x index.js
```

For global installation:

```bash
$ npm install -g
```

## Usage

The script requires start and end dates, and optionally accepts an output directory:

```bash
gh2md --start 2024-01-01 --end 2024-01-31 --output ./my-activity
```

### Command Line Options

- `-s, --start <date>` - Start date (YYYY-MM-DD) [required]
- `-e, --end <date>` - End date (YYYY-MM-DD) [required]
- `-o, --output <directory>` - Output directory (defaults to ./gh2md)
- `-b, --batch-size <number>` - Number of items to process in parallel (defaults to 10)

## Contributing

Contributions are welcome! Please feel free to submit pull requests with improvements.

## License

This project is licensed under the MIT License - see the package.json file for details.
