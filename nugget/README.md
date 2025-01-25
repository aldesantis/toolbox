# nugget

A command-line utility that uses Claude to analyze Markdown files and generate content suggestions. This tool processes your Markdown content and provides structured recommendations for additional content, including audience value assessment and key points.

## Installation

1. Clone this repository or download the source:

```bash
git clone git://github.com/your-username/nugget.git
cd nugget
```

2. Install dependencies:

```bash
npm install
```

3. Make the script executable:

```bash
chmod +x index.js
```

### Global Installation

To use the utility from anywhere in your system:

```bash
npm install -g .
```

## Configuration

The tool requires an environment variable to be set:

```bash
# Your Anthropic API key for Claude
export ANTHROPIC_API_KEY="your_anthropic_key"
```

You also need to create an instructions file (default: `~/.nuggetrc`) that contains your analysis instructions for Claude. This file guides how Claude should analyze your content and what kind of suggestions to provide. Example:

I am an e-commerce consultant specializing in strategy, design, and development for upper midmarket and enterprise brands. I publish insights about e-commerce strategy, technical implementation, or business growth.

## Usage

### Basic Usage

```bash
nugget <directory>
```

The tool will:

1. Recursively search for all Markdown files in the specified directory
2. Analyze each file using Claude
3. Generate structured content suggestions based on your instructions
4. Output the results in a consistent markdown format

### Required Arguments

| Argument    | Description                         |
| ----------- | ----------------------------------- |
| `directory` | Directory containing Markdown files |

### Optional Arguments

| Argument           | Description                                               |
| ------------------ | --------------------------------------------------------- |
| -m, --model        | Claude model to use (default: claude-3-5-sonnet-20241022) |
| -i, --instructions | Path to instructions file (defaults to ~/.nuggetrc)       |
| --help             | Show help                                                 |
| --version          | Show version number                                       |

## Output Format

For each analyzed file, the tool generates suggestions in the following format:

```markdown
# filename.md

## 1. [Suggestion Title]

### Inspiration

[What piece of the content inspired this suggestion]

### Key Points

- [Point 1]
- [Point 2]
- [Point 3]

### Audience Value

[Why this resonates with the audience]

## 2. [Additional suggestions follow the same format...]
```

## Error Handling

- Files that exceed Claude's context length will be skipped with a warning
- Any API errors or file access issues will be reported clearly
- A progress bar shows analysis status for all files

## License

This project is licensed under the MIT License - see the package.json file for details.
