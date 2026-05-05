export interface Question {
  prompt: string;
  type: "open" | "multiple_choice" | "select_all";
  options?: string[];
  answer: string | string[];
  guessRate: number;
}

export const QUESTIONS: Record<string, Question[]> = {
  anchor: [
    {
      prompt: "There are 4 bags with 6 oranges in each bag. How many oranges are there in all?",
      type: "open",
      answer: "24",
      guessRate: 0.10,
    },
    {
      prompt:
        "A classroom has 3 rows of desks with 7 desks in each row. How many desks are there?\n  A) 10  B) 21  C) 24  D) 37",
      type: "multiple_choice",
      answer: "B",
      guessRate: 0.25,
    },
  ],

  EQ1: [
    {
      prompt:
        "[Picture: 3 rows of 7 stars]\nHere are 3 groups of 7 stars — that's the same as saying 3 times as many as one group. How many stars are there in all?",
      type: "open",
      answer: "21",
      guessRate: 0.10,
    },
    {
      prompt:
        "[Picture: 4 rows of 5 apples]\nHere are 4 groups of 5 apples. Another way to say this: there are 4 times as many apples as in one group. What is the total?\n  A) 9  B) 15  C) 20  D) 25",
      type: "multiple_choice",
      answer: "C",
      guessRate: 0.25,
    },
  ],

  EQ2a: [
    {
      prompt:
        "[Picture: 3 rows of 7 stars]\nHere are 3 groups of 7 stars. Can you say this another way using the words 'times as many'?",
      type: "open",
      answer: "3 times as many as 7",
      guessRate: 0.05,
    },
    {
      prompt:
        "[Picture: 5 rows of 4 dots]\nHere are 5 groups of 4 dots. Which statement means the same thing?\n  A) 5 more than 4  B) 5 times as many as 4  C) 4 more than 5  D) 9 altogether",
      type: "multiple_choice",
      answer: "B",
      guessRate: 0.25,
    },
  ],

  EQ2b: [
    {
      prompt:
        "Emma has 6 groups of 3 stickers — that's the same as 6 times as many as 3. How many stickers does Emma have?",
      type: "open",
      answer: "18",
      guessRate: 0.10,
    },
    {
      prompt:
        "A baker made 4 groups of 8 cookies. That means 4 times as many as 8. How many cookies?\n  A) 12  B) 24  C) 32  D) 48",
      type: "multiple_choice",
      answer: "C",
      guessRate: 0.25,
    },
  ],

  EQ3: [
    {
      prompt:
        "A baker made 4 groups of 8 cookies. How would you say this using the words 'times as many'?",
      type: "open",
      answer: "4 times as many as 8",
      guessRate: 0.05,
    },
    {
      prompt:
        "A garden has 3 rows of 9 flowers. Which statement means the same thing?\n  A) 9 more than 3  B) 3 times as many as 9  C) 9 times as many as 3  D) 12 altogether",
      type: "multiple_choice",
      answer: "B",
      guessRate: 0.25,
    },
    {
      prompt: "Liam put his 30 toy cars into 5 groups of 6. Say this using 'times as many.'",
      type: "open",
      answer: "5 times as many as 6",
      guessRate: 0.05,
    },
  ],

  DISC1: [
    {
      prompt:
        "Which statement describes multiplication?\n  A) 'Jake has 8 more marbles than Ava.'  B) 'Jake has 8 times as many marbles as Ava.'",
      type: "multiple_choice",
      answer: "B",
      guessRate: 0.50,
    },
    {
      prompt:
        "Sort these: which use multiplication?\n  A) 3 more than  B) twice as many  C) 5 fewer than  D) 4 times as long",
      type: "select_all",
      answer: "B,D",
      guessRate: 0.0625,
    },
    {
      prompt: "'The rope is 4 times as long as the string.' Is this addition or multiplication?",
      type: "open",
      answer: "multiplication",
      guessRate: 0.50,
    },
  ],

  COMP1: [
    {
      prompt:
        "Mia has 4 times as many stickers as Noah. (Think: 4 groups of Noah's stickers.) Noah has 6 stickers. How many does Mia have?",
      type: "open",
      answer: "24",
      guessRate: 0.10,
    },
    {
      prompt:
        "A sunflower is 3 times as tall as a tulip. (Think: 3 groups of the tulip's height.) The tulip is 5 inches tall. How tall is the sunflower?",
      type: "open",
      answer: "15",
      guessRate: 0.10,
    },
  ],

  COMP2: [
    {
      prompt:
        "Maria has 3 times as many toy cars as Carlos. Carlos has 7 toy cars. How many does Maria have?",
      type: "open",
      answer: "21",
      guessRate: 0.10,
    },
    {
      prompt:
        "A corn stalk is 5 times as tall as a sunflower that is 2 feet tall. How tall is the corn stalk?",
      type: "open",
      answer: "10",
      guessRate: 0.10,
    },
    {
      prompt:
        "Zoe collected 8 times as many shells as Kai. Kai collected 4 shells. How many shells did Zoe collect?\n  A) 12  B) 24  C) 32  D) 48",
      type: "multiple_choice",
      answer: "C",
      guessRate: 0.25,
    },
  ],

  COMP3: [
    {
      prompt:
        "Kai has 24 marbles. Jenna has 8 marbles. Kai has how many times as many marbles as Jenna?",
      type: "open",
      answer: "3",
      guessRate: 0.10,
    },
    {
      prompt:
        "A tree is 40 feet tall. A bush is 8 feet tall. The tree is how many times as tall as the bush?",
      type: "open",
      answer: "5",
      guessRate: 0.10,
    },
    {
      prompt:
        "Rosa has 18 stickers. Dan has 6 stickers. Rosa has how many times as many as Dan?\n  A) 3  B) 6  C) 12  D) 24",
      type: "multiple_choice",
      answer: "A",
      guessRate: 0.25,
    },
  ],

  COMP4: [
    {
      prompt:
        "Maria has 24 stickers. That is 3 times as many as Carlos has. How many stickers does Carlos have?",
      type: "open",
      answer: "8",
      guessRate: 0.10,
    },
    {
      prompt: "A flagpole is 30 feet tall. That is 6 times as tall as a fence. How tall is the fence?",
      type: "open",
      answer: "5",
      guessRate: 0.10,
    },
    {
      prompt:
        "A dog weighs 36 pounds. That is 4 times as much as a cat. How much does the cat weigh?\n  A) 8  B) 9  C) 32  D) 40",
      type: "multiple_choice",
      answer: "B",
      guessRate: 0.25,
    },
  ],

  DISC2: [
    {
      prompt:
        "Solve BOTH:\n  Problem A: 'Kai has 5 times as many cards as Zoe. Zoe has 4 cards.'\n  Problem B: 'Kai has 5 more cards than Zoe. Zoe has 4 cards.'\nGive both answers as: A, B",
      type: "open",
      answer: "20, 9",
      guessRate: 0.02,
    },
    {
      prompt:
        "A rope is 3 times as long as a 7-foot stick. A ribbon is 3 feet longer than the same stick. What are the two lengths?\nGive both answers as: rope, ribbon",
      type: "open",
      answer: "21, 10",
      guessRate: 0.02,
    },
    {
      prompt:
        "'Amy has 6 times as many coins as Ben. Ben has 5 coins.' and 'Amy has 6 more coins than Ben. Ben has 5 coins.' Which gives the larger answer?\n  A) 6 times as many  B) 6 more than  C) They're equal  D) Can't tell",
      type: "multiple_choice",
      answer: "A",
      guessRate: 0.25,
    },
  ],

  SYM1a: [
    {
      prompt:
        "Look at: 3 × 7 = 21. Use the words 'times as many' to describe what this equation means.",
      type: "open",
      answer: "21 is 3 times as many as 7",
      guessRate: 0.05,
    },
    {
      prompt:
        "What does 4 × 5 = 20 mean as a comparison?\n  A) 20 is 4 more than 5  B) 20 is 4 times as many as 5  C) 5 is 4 times as many as 20  D) 4 and 5 make 20",
      type: "multiple_choice",
      answer: "B",
      guessRate: 0.25,
    },
  ],

  SYM1b: [
    {
      prompt:
        "We said 3 × 7 = 21 means '21 is 3 times as many as 7.' Does 21 = 3 × 7 mean the same comparison, or something different? Explain.",
      type: "open",
      answer: "same",
      guessRate: 0.50,
    },
    {
      prompt:
        "5 × 4 = 20 means '20 is 5 times as many as 4.' What about 20 = 5 × 4?\n  A) Same comparison  B) Different comparison  C) Not a comparison  D) Can't tell",
      type: "multiple_choice",
      answer: "A",
      guessRate: 0.25,
    },
  ],

  SYM2: [
    {
      prompt: "What does 21 = 3 × 7 mean? Use the words 'times as many.'",
      type: "open",
      answer: "21 is 3 times as many as 7",
      guessRate: 0.05,
    },
    {
      prompt:
        "Read this equation as a comparison: 40 = 8 × 5.\n  A) 40 is 8 more than 5  B) 8 is 40 times as many as 5  C) 40 is 8 times as many as 5  D) 5 is 40 times as many as 8",
      type: "multiple_choice",
      answer: "C",
      guessRate: 0.25,
    },
    {
      prompt: "What does 36 = 9 × 4 tell you using 'times as many'?",
      type: "open",
      answer: "36 is 9 times as many as 4",
      guessRate: 0.05,
    },
  ],

  SYM3a: [
    {
      prompt: "28 is 4 times as many as 7. Write the equation.",
      type: "open",
      answer: "28 = 4 × 7",
      guessRate: 0.05,
    },
    {
      prompt: "36 is 9 times as many as 4. Write the equation.",
      type: "open",
      answer: "36 = 9 × 4",
      guessRate: 0.05,
    },
    {
      prompt:
        "Which equation matches '30 is 5 times as many as 6'?\n  A) 5 × 6 = 30  B) 30 = 5 × 6  C) 30 = 6 + 5  D) 6 × 30 = 5",
      type: "multiple_choice",
      answer: "B",
      guessRate: 0.25,
    },
  ],

  SYM3b: [
    {
      prompt: "Look at 35 = 5 × 7. Give TWO different 'times as many' statements.",
      type: "open",
      answer: "35 is 5 times as many as 7, 35 is 7 times as many as 5",
      guessRate: 0.02,
    },
    {
      prompt:
        "Look at 24 = 6 × 4. Which are correct?\n  A) 24 is 6 times as many as 4  B) 24 is 4 times as many as 6  C) 6 is 24 times as many as 4  D) 4 is 6 times as many of 24",
      type: "select_all",
      answer: "A,B",
      guessRate: 0.0625,
    },
    {
      prompt:
        "For 18 = 3 × 6, give both comparison statements.\n  (a) 18 is ___ times as many as ___\n  (b) 18 is ___ times as many as ___",
      type: "open",
      answer: "18 is 3 times as many as 6, 18 is 6 times as many as 3",
      guessRate: 0.02,
    },
  ],
};
